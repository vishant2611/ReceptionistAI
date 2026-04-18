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
  businessNumber: z.string().max(40).optional().default(""),
  twilioAccountSid: z.string().min(10).max(64).optional().default(""),
  twilioAuthToken: z.string().min(10).max(128).optional().default(""),
  twilioNumber: z.string().min(7).max(40),
  fallbackNumber: z.string().max(40).optional().default(""),
  aiReceptionistEnabled: z.boolean().default(true),
  routingMode: z.enum(["AI_IMMEDIATELY", "STAFF_FIRST_THEN_AI", "STAFF_ONLY"]).default("AI_IMMEDIATELY"),
  aiTakeoverDelaySeconds: z.coerce.number().int().min(0).max(120).default(15),
  afterHoursRouting: z.enum(["AI", "VOICEMAIL", "MISSED_CALL_CAPTURE"]).default("AI"),
  handoffEnabled: z.boolean().default(true),
  voicemailFallbackEnabled: z.boolean().default(true),
  recordingEnabled: z.boolean().default(true),
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
  availabilityMode: z.enum(["AVAILABLE", "DISABLED_TODAY", "DISABLED_UNTIL"]).default("AVAILABLE"),
  disabledUntil: z.string().optional().default(""),
});

export const businessMenuUpdateSchema = z.object({
  items: z.array(businessMenuItemSchema).default([]),
  source: z
    .object({
      filename: z.string().optional().default(""),
      mimeType: z.string().optional().default(""),
      importedAt: z.string().optional().default(""),
    })
    .optional(),
});

export type BusinessMenuUpdateInput = z.infer<typeof businessMenuUpdateSchema>;

export const businessMenuImportSchema = z.object({
  filename: z.string().min(3),
  mimeType: z.string().min(3),
  contentBase64: z.string().min(20),
});

export type BusinessMenuImportInput = z.infer<typeof businessMenuImportSchema>;

export const pharmacyRefillRequestSchema = z.object({
  id: z.string().min(2),
  patientName: z.string().min(2),
  phoneNumber: z.string().min(7),
  medicationName: z.string().min(2),
  prescriptionNumber: z.string().optional().default(""),
  requestedOn: z.string().min(4),
  preferredPickupTime: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  assignedTo: z.string().optional().default(""),
  status: z
    .enum(["NEW", "UNDER_REVIEW", "APPROVED", "READY_FOR_PICKUP", "COMPLETED", "REJECTED", "NEED_CALLBACK"])
    .default("NEW"),
});

export const pharmacyRefillRequestsUpdateSchema = z.object({
  requests: z.array(pharmacyRefillRequestSchema).default([]),
});

export type PharmacyRefillRequestsUpdateInput = z.infer<typeof pharmacyRefillRequestsUpdateSchema>;

export const pharmacyCallbackRequestSchema = z.object({
  id: z.string().min(2),
  patientName: z.string().min(2),
  phoneNumber: z.string().min(7),
  reason: z.string().min(4),
  notes: z.string().optional().default(""),
  requestedOn: z.string().min(4),
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  assignedTo: z.string().optional().default(""),
  lastAttemptAt: z.string().optional().default(""),
  status: z.enum(["NEW", "ASSIGNED", "PENDING_CALLBACK", "CALLED", "COMPLETED", "UNABLE_TO_REACH"]).default("NEW"),
});

export const pharmacyCallbackRequestsUpdateSchema = z.object({
  requests: z.array(pharmacyCallbackRequestSchema).default([]),
});

export type PharmacyCallbackRequestsUpdateInput = z.infer<typeof pharmacyCallbackRequestsUpdateSchema>;
