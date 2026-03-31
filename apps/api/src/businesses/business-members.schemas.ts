import { z } from "zod";

export const businessMemberCreateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["BUSINESS_OWNER", "MANAGER", "STAFF", "BILLING_ADMIN"]),
});

export type BusinessMemberCreateInput = z.infer<typeof businessMemberCreateSchema>;
