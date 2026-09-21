import { redirect } from "next/navigation";
import { ButtonLink, Panel } from "@/components/ui";
import { CURRENCY, ECONOMY } from "@/config/economy";
import { formatMoney } from "@/lib/economy/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentPlayer } from "@/services/player/state";
import { SetupNotice } from "@/components/SetupNotice";

/**
 * Rendered per request: every one of these pages reads the signed-in
 * player's own state, so there is nothing to prerender.
 */
export const dynamic = "force-dynamic";

const LOOP = [
  { step: "Start", body: `Sign up and take ${formatMoney(ECONOMY.startingCash)} plus a free plot of land.` },
  { step: "Build", body: "Put a business on your land - a farm, a mine, a shop, a factory." },
  { step: "Work", body: "Walk into your own business and grind. Active work pays better than idling." },
  { step: "Earn", body: "Your business keeps producing while you are logged out." },
  { step: "Expand", body: "Buy more land, hire workers, run vehicles, advertise across the city." },
  { step: "Risk", body: "Trade other players' stock, or take your chances in the gambling district." },
];

export default async function LandingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6">
        <SetupNotice />
      </main>
    );
  }

  const player = await getCurrentPlayer();
  if (player) redirect(player.isOnboarded ? "/dashboard" : "/onboarding");

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.3em] text-brand-400 uppercase">
        Persistent multiplayer sandbox
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-[1.05] font-black text-white sm:text-6xl">
        Everyone starts small.
        <br />
        <span className="text-cash-400">Anyone can end up richest.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-300">
        World Economy is one shared 3D world with one shared economy. Own land, run a
        company, produce goods, trade with other players and build an empire that keeps
        running after you log off.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/signup" variant="money" size="lg">
          Start with {formatMoney(ECONOMY.startingCash)}
        </ButtonLink>
        <ButtonLink href="/login" variant="ghost" size="lg">
          I already have a company
        </ButtonLink>
      </div>

      <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LOOP.map((item, i) => (
          <li key={item.step}>
            <Panel className="h-full p-5">
              <div className="flex items-center gap-2">
                <span className="tnum grid h-6 w-6 place-items-center rounded-md bg-brand-500/20 text-xs font-bold text-brand-400">
                  {i + 1}
                </span>
                <h2 className="font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-slate-100 uppercase">
                  {item.step}
                </h2>
              </div>
              <p className="mt-2 text-sm text-slate-400">{item.body}</p>
            </Panel>
          </li>
        ))}
      </ol>

      <p className="mt-14 max-w-2xl text-xs text-slate-500">
        {CURRENCY.disclaimer} There are no deposits, withdrawals, purchases or cash-outs
        of any kind. Every market, match and casino game in World Economy is fictional and
        resolved by the game server.
      </p>
    </main>
  );
}
