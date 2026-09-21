import { z } from "zod";
import { INDUSTRY_KEYS } from "@/config/economy";

/**
 * Client + server-action validation for onboarding.
 *
 * These rules deliberately mirror the CHECK constraints and the validation
 * inside complete_onboarding(). This layer exists to give a good form
 * experience; the database is what actually enforces them.
 */

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usernames need at least 3 characters.")
  .max(20, "Usernames are at most 20 characters.")
  .regex(/^[A-Za-z0-9_]+$/, "Letters, numbers and underscores only.");

export const companyNameSchema = z
  .string()
  .trim()
  .min(3, "Company names need at least 3 characters.")
  .max(40, "Company names are at most 40 characters.")
  .refine((v) => !/[<>]/.test(v), "No < or > characters, please.")
  // Control characters would make a company name unrenderable in the world.
  .refine(
    (v) => ![...v].some((ch) => ch.codePointAt(0)! < 0x20),
    "That name contains invalid characters.",
  );

export const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}$/, "Tickers are 2-5 letters, like NOA.");

export const industrySchema = z.enum(INDUSTRY_KEYS as [string, ...string[]]);

export const onboardingSchema = z.object({
  username: usernameSchema,
  companyName: companyNameSchema,
  ticker: tickerSchema,
  industry: industrySchema,
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Passwords need at least 8 characters."),
});
