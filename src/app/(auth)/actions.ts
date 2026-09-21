"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { credentialsSchema } from "@/lib/validation/onboarding";
// Imported, not declared here: a "use server" module may only export async
// functions, so the state object lives in its own file.
import type { AuthFormState } from "./form-state";

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

/**
 * Supabase auth errors are usually meaningful to a player ("User already
 * registered"), but a network or misconfiguration failure surfaces as an
 * opaque "fetch failed", which tells them nothing. Translate those.
 */
function authErrorMessage(message: string | undefined, fallback: string): string {
  const raw = (message ?? "").trim();
  if (!raw) return fallback;
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|socket hang up/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return raw;
}

/** Only allow same-origin relative paths, so `?next=` can't become an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  return /^\/(?!\/)[A-Za-z0-9\-._~/]*$/.test(raw) ? raw : "/dashboard";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details.", notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // A real credential mismatch stays deliberately vague, so this does not
    // reveal whether an email is registered. Infrastructure failures are
    // reported honestly, because the player can act on those.
    const message = authErrorMessage(error.message, "");
    return {
      error: message.startsWith("Couldn't reach")
        ? message
        : "That email and password don't match.",
      notice: null,
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details.", notice: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return {
      error: authErrorMessage(error.message, "Couldn't create your account."),
      notice: null,
    };
  }

  // With email confirmation switched on there is no session yet.
  if (!data.session) {
    return {
      error: null,
      notice: "Check your email to confirm your account, then sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
