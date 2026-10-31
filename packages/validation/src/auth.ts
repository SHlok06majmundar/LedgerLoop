import { z } from 'zod';

const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

const email = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
