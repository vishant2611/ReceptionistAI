import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { BusinessCategory, SubscriptionStatus, UserRole } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SignInInput, SignUpInput } from "./auth.schemas";

const medicalCategories = new Set<BusinessCategory>([
  BusinessCategory.CLINIC,
  BusinessCategory.DOCTOR,
  BusinessCategory.DENTAL,
  BusinessCategory.PHARMACY,
  BusinessCategory.PHYSIOTHERAPY,
  BusinessCategory.VETERINARY,
]);

function normalizeCategory(industryType: string): BusinessCategory {
  const value = industryType.trim().toUpperCase().replace(/[\s/-]+/g, "_");
  return BusinessCategory[value as keyof typeof BusinessCategory] ?? BusinessCategory.OTHER;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [salt, stored] = passwordHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(stored, "hex");

  if (storedBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derived);
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signUp(input: SignUpInput) {
    try {
      const email = input.email.trim().toLowerCase();
      const existing = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        throw new BadRequestException("An account with this email already exists.");
      }

      const category = normalizeCategory(input.industryType);
      const medicalModeEnabled = medicalCategories.has(category);

      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            fullName: input.businessName.trim(),
            passwordHash: hashPassword(input.password),
            role: UserRole.BUSINESS_OWNER,
          },
        });

        const business = await tx.business.create({
          data: {
            name: input.businessName.trim(),
            category,
            email,
            phoneNumber: input.phone.trim(),
            address: input.address.trim(),
            medicalModeEnabled,
            members: {
              create: {
                userId: user.id,
                role: UserRole.BUSINESS_OWNER,
              },
            },
            subscription: {
              create: {
                planName: "Free Trial",
                status: SubscriptionStatus.TRIAL,
              },
            },
          },
        });

        return { user, business };
      });

      return {
        message: "Account created successfully.",
        user: {
          id: created.user.id,
          email: created.user.email,
          role: created.user.role,
        },
        business: {
          id: created.business.id,
          name: created.business.name,
          category: created.business.category,
          medicalModeEnabled: created.business.medicalModeEnabled,
        },
      };
    } catch (error) {
      console.error("signup_error", error);
      throw error;
    }
  }

  async signIn(input: SignInInput) {
    const identity = input.identity.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: identity },
      include: {
        memberships: {
          include: {
            business: true,
          },
        },
      },
    });

    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    return {
      message: "Signed in successfully.",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      businesses: user.memberships.map((membership) => ({
        id: membership.business.id,
        name: membership.business.name,
        category: membership.business.category,
        role: membership.role,
        onboardingCompleted: membership.business.onboardingCompleted,
      })),
    };
  }
}
