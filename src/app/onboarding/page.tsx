import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Panel } from "@/components/ui";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { formatMoney } from "@/lib/economy/format";
import { getCurrentPlayer, getGameSettings } from "@/services/player/state";
import { OnboardingForm } from "./onboarding-form";

/**
 * Rendered per request: every one of these pages reads the signed-in
 * player's own state, so there is nothing to prerender.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Found your company" };

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6">
        <SetupNotice />
      </main>
    );
  }

  const [player, settings] = await Promise.all([getCurrentPlayer(), getGameSettings()]);

  if (!player) redirect("/login");
  if (player.isOnboarded) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <p className="font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.3em] text-brand-400 uppercase">
        Step 1 of 1
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-black text-white">
        Found your company
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        This is the only setup there is. Once it&apos;s done you&apos;ll have{" "}
        <span className="font-semibold text-cash-400">
          {formatMoney(settings.startingCash)}
        </span>
        , a plot of land and a place in the world.
      </p>

      <Panel className="mt-6 p-6">
        <OnboardingForm />
      </Panel>

      <p className="mt-4 text-xs text-slate-500">
        Your company name and ticker are public - other players will see them on the map,
        on your buildings and on the stock market.
      </p>
    </main>
  );
}
