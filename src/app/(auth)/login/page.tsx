import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/SetupNotice";
import { CredentialsForm } from "../credentials-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  return (
    <Panel className="p-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
        Welcome back
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Your company has been running without you.
      </p>

      <CredentialsForm mode="signin" />

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
