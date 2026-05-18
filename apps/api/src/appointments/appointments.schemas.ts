import { z } from "zod";

export const appointmentStatusEnum = z.enum([
  "SCHEDULED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const appointmentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  customerName: z.string().max(120).optional().default(""),
  customerPhone: z.string().max(40).optional().default(""),
  customerEmail: z.string().max(160).optional().default(""),
  serviceName: z.string().max(160).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  startTime: z.string().min(1), // ISO datetime
  durationMinutes: z.coerce.number().int().min(5).max(720).default(30),
  status: appointmentStatusEnum.default("SCHEDULED"),
  callId: z.string().optional().nullable(),
});

export const appointmentUpdateSchema = appointmentCreateSchema.partial();

export const appointmentListQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  status: appointmentStatusEnum.optional(),
});

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;
