import type { Metadata } from "next";
import Link from "next/link";
import { FormError, Panel } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/SetupNotice";
import { CredentialsForm } from "../credentials-form";

export const metadata: Metadata = { title: "Sign in" };

/** Messages for the codes /auth/callback redirects here with. */
const CALLBACK_ERRORS: Record<string, string> = {
  missing_code: "That confirmation link was incomplete. Try signing in below.",
  invalid_code: "That confirmation link has expired or was already used.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { next, error } = await searchParams;

  return (
    <Panel className="p-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
        Welcome back
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Your company has been running without you.
      </p>

      {error ? (
        <div className="mt-4">
          <FormError message={CALLBACK_ERRORS[error] ?? "Something went wrong signing you in."} />
        </div>
      ) : null}

      <CredentialsForm mode="signin" next={next} />

      <p className="mt-5 text-sm text-slate-400">
        No company yet?{" "}
        <Link href="/signup" className="font-semibold text-brand-400 hover:underline">
          Start one
        </Link>
        .
      </p>
    </Panel>
  );
}
