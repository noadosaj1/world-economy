"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { toGameFailure } from "@/lib/errors";
import type { OnboardingResult } from "@/types/db";

export type OnboardingState = { error: string | null };

export const emptyOnboardingState: OnboardingState = { error: null };

/**
 * Creates the player's company.
 *
 * All the real work happens inside the complete_onboarding() database
 * function: it validates, creates the company, grants the starting balance
 * with a ledger entry and claims the starter plot in a single transaction.
 * This action only shapes the input and translates errors.
 */
export async function createCompany(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = onboardingSchema.safeParse({
    username: formData.get("username"),
    companyName: formData.get("companyName"),
    ticker: formData.get("ticker"),
    industry: formData.get("industry"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("complete_onboarding", {
    p_username: parsed.data.username,
    p_company_name: parsed.data.companyName,
    p_ticker: parsed.data.ticker,
    p_industry: parsed.data.industry,
  });

  if (error) {
    return { error: toGameFailure(error).message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard?welcome=1");
}

export type { OnboardingResult };
