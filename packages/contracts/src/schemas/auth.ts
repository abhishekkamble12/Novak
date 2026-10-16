import { z } from "zod";

export const RegisterInputSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must not exceed 30 characters")
    .regex(/^[a-z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().trim().min(1, "Name is required").max(60),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  emailOrUsername: z.string().trim().toLowerCase().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required").max(128),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const UpdateProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  bio: z.string().trim().max(160).optional(),
  avatarUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "Avatar URL must use https")
    .optional()
    .or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export const UserSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  bio: z.string().optional(),
  postsCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export type UserSummary = z.infer<typeof UserSummarySchema>;

export const AuthResultSchema = z.object({
  user: UserSummarySchema,
  accessToken: z.string(),
});

export type AuthResult = z.infer<typeof AuthResultSchema>;
