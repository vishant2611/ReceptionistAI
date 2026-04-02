import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BusinessCategory, UserRole } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BusinessMemberCreateInput } from "./business-members.schemas";
import { BusinessAiSettingsInput, BusinessOnboardingInput, BusinessTelephonySettingsInput } from "./businesses.schemas";

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

function readBusinessRules(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDemoCalls(businessId: string, businessName: string, businessCategory: BusinessCategory) {
    const count = await this.prisma.call.count({
      where: { businessId },
    });

    if (count > 0) {
      return;
    }

    const businessLabel = businessName || "the business";
    const emergencyNote =
      businessCategory === BusinessCategory.CLINIC || businessCategory === BusinessCategory.DOCTOR
        ? "If this is a medical emergency, please call 911 immediately."
        : "";

    await this.prisma.call.createMany({
      data: [
        {
          businessId,
          status: "ANSWERED_BY_AI",
          callerName: "Michael Turner",
          callerNumber: "+1 519-555-0142",
          callerEmail: "michael.turner@example.com",
          summary: "Asked for pricing and placed a same-day pickup order.",
          transcript: `Caller asked whether ${businessLabel} was open after hours. AI explained pickup timing, confirmed menu pricing, and recorded a same-day order request.`,
          recordingUrl: "https://example.com/recordings/demo-call-1",
          startedAt: new Date(Date.now() - 1000 * 60 * 32),
          endedAt: new Date(Date.now() - 1000 * 60 * 27),
        },
        {
          businessId,
          status: "ANSWERED_BY_AI",
          callerName: "Sarah Collins",
          callerNumber: "+1 226-555-0194",
          callerEmail: "sarah.collins@example.com",
          summary: "Requested a callback and asked about available consultation times.",
          transcript: `Caller wanted a consultation slot next week. AI captured callback preference, caller email, and a short note for staff follow-up.`,
          recordingUrl: "https://example.com/recordings/demo-call-2",
          startedAt: new Date(Date.now() - 1000 * 60 * 115),
          endedAt: new Date(Date.now() - 1000 * 60 * 110),
        },
        {
          businessId,
          status: "ESCALATED",
          callerName: "Emma Wright",
          callerNumber: "+1 437-555-0177",
          callerEmail: "emma.wright@example.com",
          summary: `After-hours request captured. ${emergencyNote}`.trim(),
          transcript: `Caller reached ${businessLabel} outside office hours. AI recorded the message, explained after-hours fulfillment timing, and delivered the configured safety guidance when applicable.`,
          recordingUrl: "https://example.com/recordings/demo-call-3",
          startedAt: new Date(Date.now() - 1000 * 60 * 245),
          endedAt: new Date(Date.now() - 1000 * 60 * 240),
        },
      ],
    });
  }

  async getBusinessById(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    return {
      business: {
        id: business.id,
        name: business.name,
        category: business.category,
        email: business.email,
        phoneNumber: business.phoneNumber,
        address: business.address,
        description: business.description,
        servicesSummary: business.servicesSummary,
        priceListSummary: business.priceListSummary,
        officeHours: business.officeHours,
        answeringRules: business.answeringRules,
        greetingMessage: business.greetingMessage,
        voicePreference: business.voicePreference,
        selectedPlan: business.selectedPlan,
        billingCycle: business.billingCycle,
        onboardingCompleted: business.onboardingCompleted,
        medicalModeEnabled: business.medicalModeEnabled,
        aiEnabled: business.aiEnabled,
        timezone: business.timezone,
        telephonySettings: readBusinessRules(business.answeringRules).telephony ?? null,
      },
    };
  }

  async updateAiSettings(businessId: string, input: BusinessAiSettingsInput) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!existing) {
      throw new NotFoundException("Business not found.");
    }

    const previousRules = readBusinessRules(existing.answeringRules);

    const previousOfficeHours = Array.isArray(existing.officeHours) ? existing.officeHours : [];

    const emergencyMessage =
      input.emergencyMessage.trim() || (existing.medicalModeEnabled ? "If this is a medical emergency, please call 911." : "");

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        aiEnabled: input.aiEnabled,
        greetingMessage: input.greetingMessage.trim(),
        voicePreference: input.voicePreference.trim(),
        answeringRules: {
          ...previousRules,
          callHandlingMode: input.callHandlingMode,
          primaryMode: input.answerMode,
          ringCount: input.ringCount,
          afterHoursEnabled: input.afterHoursEnabled,
          afterHoursMessage: input.afterHoursMessage.trim(),
          emergencyMessage,
          recordCalls: input.recordCalls,
          sendSummaryEmail: input.sendSummaryEmail,
        },
        officeHours: previousOfficeHours,
      },
    });

    return {
      message: "AI settings updated successfully.",
      business: {
        id: business.id,
        aiEnabled: business.aiEnabled,
        greetingMessage: business.greetingMessage,
        voicePreference: business.voicePreference,
        answeringRules: business.answeringRules,
        medicalModeEnabled: business.medicalModeEnabled,
      },
    };
  }

  async updateTelephonySettings(businessId: string, input: BusinessTelephonySettingsInput) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!existing) {
      throw new NotFoundException("Business not found.");
    }

    const previousRules = readBusinessRules(existing.answeringRules);
    const nextTelephonySettings = {
      provider: input.provider,
      connectionMode: input.connectionMode,
      twilioNumber: input.twilioNumber.trim(),
      fallbackNumber: input.fallbackNumber.trim(),
      handoffEnabled: input.handoffEnabled,
      voicemailFallbackEnabled: input.voicemailFallbackEnabled,
      consentMessage: input.consentMessage.trim(),
      postCallSmsEnabled: input.postCallSmsEnabled,
      preparedAt: new Date().toISOString(),
    };

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        answeringRules: {
          ...previousRules,
          telephony: nextTelephonySettings,
        },
      },
    });

    return {
      message: "Telephony preparation settings updated successfully.",
      business: {
        id: business.id,
        telephonySettings: readBusinessRules(business.answeringRules).telephony ?? null,
      },
    };
  }

  async listMembers(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        members: {
          include: {
            user: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    return {
      members: business.members.map((member) => ({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: member.user.id,
          email: member.user.email,
          fullName: member.user.fullName,
        },
      })),
    };
  }

  async listCalls(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    await this.ensureDemoCalls(business.id, business.name, business.category);

    const calls = await this.prisma.call.findMany({
      where: { businessId },
      orderBy: {
        startedAt: "desc",
      },
    });

    return {
      calls: calls.map((call) => ({
        id: call.id,
        status: call.status,
        direction: call.direction,
        callerName: call.callerName,
        callerNumber: call.callerNumber,
        callerEmail: call.callerEmail,
        summary: call.summary,
        transcript: call.transcript,
        recordingUrl: call.recordingUrl,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
      })),
    };
  }

  async addMember(businessId: string, input: BusinessMemberCreateInput) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException("Business not found.");
    }

    const email = input.email.trim().toLowerCase();
    const role = UserRole[input.role];

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: true,
      },
    });

    if (existingUser?.memberships.some((membership) => membership.businessId === businessId)) {
      throw new BadRequestException("This user is already a member of the business.");
    }

    const createdMember = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email,
            fullName: input.fullName.trim(),
            passwordHash: hashPassword(input.password),
            role,
          },
        }));

      const member = await tx.businessMember.create({
        data: {
          businessId,
          userId: user.id,
          role,
        },
        include: {
          user: true,
        },
      });

      if (existingUser && (!existingUser.fullName || existingUser.role !== role)) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            fullName: input.fullName.trim(),
            role,
          },
        });
      }

      return member;
    });

    return {
      message: "Team member added successfully.",
      member: {
        id: createdMember.id,
        role: createdMember.role,
        user: {
          id: createdMember.user.id,
          email: createdMember.user.email,
          fullName: createdMember.user.fullName,
        },
      },
    };
  }

  async updateOnboarding(businessId: string, input: BusinessOnboardingInput) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!existing) {
      throw new NotFoundException("Business not found.");
    }

    const category = normalizeCategory(input.industryType);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        name: input.businessName.trim(),
        category,
        phoneNumber: input.phone.trim(),
        timezone: input.timezone.trim(),
        address: input.address.trim(),
        description: input.businessSummary.trim(),
        servicesSummary: input.servicesSummary.trim() || input.businessSummary.trim(),
        priceListSummary: input.priceListSummary.trim() || null,
        officeHours: input.officeHours,
        answeringRules: {
          primaryMode: input.answeringRule.trim(),
        },
        greetingMessage: input.greetingMessage.trim() || null,
        voicePreference: input.voicePreference.trim() || null,
        selectedPlan: input.selectedPlan.trim() || null,
        billingCycle: input.billingCycle.trim() || null,
        onboardingCompleted: true,
        medicalModeEnabled: medicalCategories.has(category),
      },
    });

    return {
      message: "Business onboarding updated successfully.",
      business: {
        id: business.id,
        name: business.name,
        onboardingCompleted: business.onboardingCompleted,
        medicalModeEnabled: business.medicalModeEnabled,
      },
    };
  }
}
