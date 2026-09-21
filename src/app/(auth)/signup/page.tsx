import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";
import { ECONOMY } from "@/config/economy";
import { formatMoney } from "@/lib/economy/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/SetupNotice";
import { CredentialsForm } from "../credentials-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { next } = await searchParams;

  return (
    <Panel className="p-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
        Start your company
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        You&apos;ll get {formatMoney(ECONOMY.startingCash)} and a free plot of land.
      </p>

      <CredentialsForm mode="signup" next={next} />

      <p className="mt-5 text-sm text-slate-400">
        Already playing?{" "}
        <Link href="/login" className="font-semibold text-brand-400 hover:underline">
          Sign in
        </Link>
        .
      </p>
    </Panel>
  );
}
