import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BusinessCategory, UserRole } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BusinessMemberCreateInput } from "./business-members.schemas";
import {
  BusinessAiSettingsInput,
  BusinessMenuImportInput,
  BusinessMenuUpdateInput,
  BusinessOnboardingInput,
  BusinessProfileUpdateInput,
  BusinessTelephonySettingsInput,
} from "./businesses.schemas";

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

function extractMenuItems(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const rules = value as Record<string, unknown>;
  const menu = rules.menu;

  if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
    return [];
  }

  const items = (menu as Record<string, unknown>).items;

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const record = item as Record<string, unknown>;

      return {
        name: String(record.name ?? "").trim(),
        category: String(record.category ?? "").trim(),
        description: String(record.description ?? "").trim(),
        price: String(record.price ?? "").trim(),
        available: record.available !== false,
        availabilityMode:
          record.availabilityMode === "DISABLED_TODAY" || record.availabilityMode === "DISABLED_UNTIL"
            ? record.availabilityMode
            : "AVAILABLE",
        disabledUntil: String(record.disabledUntil ?? "").trim(),
      };
    })
    .filter((item) => item.name.length > 0 && item.category.length > 0);
}

function extractMenuSource(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const rules = value as Record<string, unknown>;
  const menu = rules.menu;

  if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
    return null;
  }

  const source = (menu as Record<string, unknown>).source;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  return {
    filename: String((source as Record<string, unknown>).filename ?? "").trim(),
    mimeType: String((source as Record<string, unknown>).mimeType ?? "").trim(),
    importedAt: String((source as Record<string, unknown>).importedAt ?? "").trim(),
  };
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = withoutFences.indexOf("[");
  const lastBracket = withoutFences.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return `{"items":${withoutFences.slice(firstBracket, lastBracket + 1)}}`;
  }

  return "";
}

function extractResponseText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const output = record.output;

  if (!Array.isArray(output)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const content = (item as Record<string, unknown>).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const entry of content) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const textValue = (entry as Record<string, unknown>).text;

      if (typeof textValue === "string" && textValue.trim()) {
        parts.push(textValue);
      }
    }
  }

  return parts.join("\n").trim();
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
        menuItems: extractMenuItems(business.answeringRules),
        menuSource: extractMenuSource(business.answeringRules),
      },
    };
  }

  async updateProfile(businessId: string, input: BusinessProfileUpdateInput) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!existing) {
      throw new NotFoundException("Business not found.");
    }

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        name: input.businessName.trim(),
        phoneNumber: input.phoneNumber.trim(),
        timezone: input.timezone.trim(),
        address: input.address.trim(),
        description: input.description.trim(),
        servicesSummary: input.servicesSummary.trim(),
        priceListSummary: input.priceListSummary.trim() || null,
        officeHours: input.officeHours,
      },
    });

    return {
      message: "Business profile updated successfully.",
      business: {
        id: business.id,
        name: business.name,
        phoneNumber: business.phoneNumber,
        timezone: business.timezone,
        address: business.address,
        description: business.description,
        servicesSummary: business.servicesSummary,
        priceListSummary: business.priceListSummary,
        officeHours: business.officeHours,
      },
    };
  }

  async updateMenu(businessId: string, input: BusinessMenuUpdateInput) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!existing) {
      throw new NotFoundException("Business not found.");
    }

    const previousRules = readBusinessRules(existing.answeringRules);
    const nextMenuItems = input.items.map((item) => ({
      name: item.name.trim(),
      category: item.category.trim(),
      description: item.description.trim(),
      price: item.price.trim(),
      available: item.available,
      availabilityMode: item.availabilityMode,
      disabledUntil: item.disabledUntil.trim(),
    }));
    const previousMenu =
      previousRules.menu && typeof previousRules.menu === "object" && !Array.isArray(previousRules.menu)
        ? (previousRules.menu as Record<string, unknown>)
        : {};

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        answeringRules: {
          ...previousRules,
          menu: {
            items: nextMenuItems,
            source: input.source ?? previousMenu.source ?? null,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });

    return {
      message: "Menu updated successfully.",
      business: {
        id: business.id,
        menuItems: extractMenuItems(business.answeringRules),
        menuSource: extractMenuSource(business.answeringRules),
      },
    };
  }

  async importMenu(businessId: string, input: BusinessMenuImportInput) {
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!existing) {
      throw new NotFoundException("Business not found.");
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new BadRequestException("OPENAI_API_KEY is required to import PDF or image menus.");
    }

    const model = "gpt-4.1-mini";
    const isPdf = input.mimeType.toLowerCase().includes("pdf");
    let inputItem:
      | {
          type: "input_file";
          file_id: string;
        }
      | {
          type: "input_image";
          image_url: string;
          detail: "high";
        };

    if (isPdf) {
      const fileBuffer = Buffer.from(input.contentBase64, "base64");
      const fileForm = new FormData();
      fileForm.set("purpose", "user_data");
      fileForm.set("file", new Blob([fileBuffer], { type: input.mimeType }), input.filename);

      const uploadResponse = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: fileForm,
      });

      const uploadPayload = (await uploadResponse.json()) as {
        id?: string;
        error?: { message?: string };
      };

      if (!uploadResponse.ok || !uploadPayload.id) {
        throw new BadRequestException(uploadPayload.error?.message || "PDF upload for menu extraction failed.");
      }

      inputItem = {
        type: "input_file",
        file_id: uploadPayload.id,
      };
    } else {
      inputItem = {
        type: "input_image",
        image_url: `data:${input.mimeType};base64,${input.contentBase64}`,
        detail: "high",
      };
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Extract a restaurant or bakery menu into strict JSON. Return only one JSON object with this shape: {\"items\":[{\"name\":\"string\",\"category\":\"string\",\"description\":\"string\",\"price\":\"string\"}]}. Use short categories like Appetizers, Soups, Salads, Pasta, Mains, Desserts, Drinks, Bakery, Cakes. Do not include explanations. If price is missing, use an empty string.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Read this uploaded menu and extract menu items into the requested JSON format.",
              },
              inputItem,
            ],
          },
        ],
      }),
    });

    const payload = (await response.json()) as {
      output_text?: string;
      output?: unknown;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new BadRequestException(payload.error?.message || "Menu extraction failed.");
    }

    const rawJson = extractJsonObject(extractResponseText(payload));

    if (!rawJson) {
      throw new BadRequestException("Menu extraction did not return valid structured data.");
    }

    const parsed = JSON.parse(rawJson) as {
      items?: Array<Record<string, unknown>>;
    };

    const extractedItems = Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => ({
            name: String(item.name ?? "").trim(),
            category: String(item.category ?? "").trim(),
            description: String(item.description ?? "").trim(),
            price: String(item.price ?? "").trim(),
            available: true,
            availabilityMode: "AVAILABLE",
            disabledUntil: "",
          }))
          .filter((item) => item.name.length > 0 && item.category.length > 0)
      : [];

    return {
      message: extractedItems.length > 0 ? "Menu extracted successfully. Review the items before saving." : "No menu items were extracted.",
      items: extractedItems,
      source: {
        filename: input.filename,
        mimeType: input.mimeType,
        importedAt: new Date().toISOString(),
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
      businessNumber: input.businessNumber.trim(),
      twilioNumber: input.twilioNumber.trim(),
      fallbackNumber: input.fallbackNumber.trim(),
      aiReceptionistEnabled: input.aiReceptionistEnabled,
      routingMode: input.routingMode,
      aiTakeoverDelaySeconds: input.aiTakeoverDelaySeconds,
      afterHoursRouting: input.afterHoursRouting,
      handoffEnabled: input.handoffEnabled,
      voicemailFallbackEnabled: input.voicemailFallbackEnabled,
      recordingEnabled: input.recordingEnabled,
      consentMessage: input.consentMessage.trim(),
      postCallSmsEnabled: input.postCallSmsEnabled,
      preparedAt: new Date().toISOString(),
    };

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        aiEnabled: input.aiReceptionistEnabled,
        answeringRules: {
          ...previousRules,
          callHandlingMode: input.routingMode === "STAFF_ONLY" ? "STAFF_FIRST" : "LIVE_AI",
          primaryMode:
            input.routingMode === "AI_IMMEDIATELY"
              ? "ALL_CALLS"
              : input.afterHoursRouting === "AI"
                ? "AFTER_MISSED_RINGS"
                : "BUSINESS_HOURS",
          ringCount: Math.max(1, Math.round(input.aiTakeoverDelaySeconds / 5) || 1),
          afterHoursEnabled: input.afterHoursRouting === "AI" || input.afterHoursRouting === "MISSED_CALL_CAPTURE",
          recordCalls: input.recordingEnabled,
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
