import { z } from "zod";

export const signUpSchema = z.object({
  businessName: z.string().min(2),
  industryType: z.string().min(2),
  address: z.string().min(4),
  phone: z.string().min(7),
  email: z.string().email(),
  password: z.string().min(8),
});

export const signInSchema = z.object({
  identity: z.string().min(3),
  password: z.string().min(8),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
