import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { BusinessCategory, SubscriptionStatus, UserRole } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AdminResetPasswordInput, ChangePasswordInput, SignInInput, SignUpInput } from "./auth.schemas";

const medicalCategories = new Set<BusinessCategory>([
  BusinessCategory.CLINIC,
  BusinessCategory.DOCTOR,
  BusinessCategory.DENTAL,
  BusinessCategory.PHARMACY,
  BusinessCategory.PHYSIOTHERAPY,
  BusinessCategory.VETERINARY,
]);

const DEFAULT_ADMIN_EMAIL = "aryan.bhatia26@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "vishant12345";

function normalizeCategory(industryType: string): BusinessCategory {
  const value = industryType.trim().toUpperCase().replace(/[\s/-]+/g, "_");
  return BusinessCategory[value as keyof typeof BusinessCategory] ?? BusinessCategory.OTHER;
}

function resolveOnboardingCompleted(
  business: {
    onboardingCompleted: boolean;
    name?: string | null;
    category?: string | BusinessCategory | null;
    phoneNumber?: string | null;
    address?: string | null;
    timezone?: string | null;
    description?: string | null;
    servicesSummary?: string | null;
  },
) {
  if (business.onboardingCompleted) {
    return true;
  }

  const hasCoreIdentity =
    String(business.name ?? "").trim().length >= 2 &&
    String(business.category ?? "").trim().length >= 2 &&
    String(business.phoneNumber ?? "").trim().length >= 7 &&
    String(business.address ?? "").trim().length >= 4 &&
    String(business.timezone ?? "").trim().length >= 3;

  const hasBusinessContext =
    String(business.description ?? "").trim().length >= 10 ||
    String(business.servicesSummary ?? "").trim().length >= 10;

  return hasCoreIdentity && hasBusinessContext;
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

  private async ensureDefaultAdminUser() {
    const email = DEFAULT_ADMIN_EMAIL.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: {
        email,
        fullName: "Aryan Bhatia",
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
        role: UserRole.SUPER_ADMIN,
      },
    });
  }

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
    await this.ensureDefaultAdminUser();

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

    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.SUPPORT_ADMIN ||
      user.role === UserRole.OPERATIONS_ADMIN
    ) {
      return {
        message: "Signed in successfully.",
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        isAdmin: true,
        adminRole: user.role,
        businesses: [],
      };
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
        onboardingCompleted: resolveOnboardingCompleted(membership.business),
      })),
    };
  }

  async changePassword(input: ChangePasswordInput) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user?.passwordHash || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new UnauthorizedException("Current password is incorrect.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(input.newPassword),
      },
    });

    return {
      message: "Password updated successfully.",
    };
  }

  async adminResetPassword(input: AdminResetPasswordInput) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException("User not found.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(input.newPassword),
      },
    });

    return {
      message: "Password reset successfully.",
    };
  }
}
