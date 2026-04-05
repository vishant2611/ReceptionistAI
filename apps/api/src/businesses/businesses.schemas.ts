import { z } from "zod";

export const businessOnboardingSchema = z.object({
  businessName: z.string().min(2),
  industryType: z.string().min(2),
  phone: z.string().min(7),
  timezone: z.string().min(3),
  address: z.string().min(4),
  businessSummary: z.string().min(10),
  servicesSummary: z.string().optional().default(""),
  priceListSummary: z.string().optional().default(""),
  officeHours: z.array(z.string()).default([]),
  answeringRule: z.string().optional().default("Answer all calls"),
  greetingMessage: z.string().optional().default(""),
  voicePreference: z.string().optional().default("Professional female"),
  selectedPlan: z.string().optional().default("Free Trial"),
  billingCycle: z.string().optional().default("Monthly"),
});

export type BusinessOnboardingInput = z.infer<typeof businessOnboardingSchema>;

export const businessAiSettingsSchema = z.object({
  aiEnabled: z.boolean().default(false),
  callHandlingMode: z.enum(["LIVE_AI", "MESSAGE_CAPTURE", "HYBRID", "STAFF_FIRST"]).default("LIVE_AI"),
  answerMode: z.enum(["ALL_CALLS", "BUSINESS_HOURS", "AFTER_MISSED_RINGS"]).default("ALL_CALLS"),
  ringCount: z.coerce.number().int().min(1).max(8).default(3),
  greetingMessage: z.string().min(6).max(500),
  voicePreference: z.string().min(2).max(120),
  afterHoursEnabled: z.boolean().default(true),
  afterHoursMessage: z.string().min(6).max(500),
  emergencyMessage: z.string().max(500).optional().default(""),
  recordCalls: z.boolean().default(true),
  sendSummaryEmail: z.boolean().default(true),
});

export type BusinessAiSettingsInput = z.infer<typeof businessAiSettingsSchema>;

export const businessTelephonySettingsSchema = z.object({
  provider: z.enum(["TWILIO"]).default("TWILIO"),
  connectionMode: z.enum(["DIRECT_TO_AI", "AI_AFTER_MISSED_RINGS", "BUSINESS_HOURS_ONLY"]).default("DIRECT_TO_AI"),
  twilioNumber: z.string().min(7).max(40),
  fallbackNumber: z.string().max(40).optional().default(""),
  handoffEnabled: z.boolean().default(true),
  voicemailFallbackEnabled: z.boolean().default(true),
  consentMessage: z.string().min(6).max(500),
  postCallSmsEnabled: z.boolean().default(false),
});

export type BusinessTelephonySettingsInput = z.infer<typeof businessTelephonySettingsSchema>;

export const businessProfileUpdateSchema = z.object({
  businessName: z.string().min(2),
  phoneNumber: z.string().min(7),
  timezone: z.string().min(3),
  address: z.string().min(4),
  description: z.string().optional().default(""),
  servicesSummary: z.string().optional().default(""),
  priceListSummary: z.string().optional().default(""),
  officeHours: z.array(z.string()).default([]),
});

export type BusinessProfileUpdateInput = z.infer<typeof businessProfileUpdateSchema>;

export const businessMenuItemSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  description: z.string().optional().default(""),
  price: z.string().optional().default(""),
  available: z.boolean().default(true),
});

export const businessMenuUpdateSchema = z.object({
  items: z.array(businessMenuItemSchema).default([]),
});

export type BusinessMenuUpdateInput = z.infer<typeof businessMenuUpdateSchema>;
