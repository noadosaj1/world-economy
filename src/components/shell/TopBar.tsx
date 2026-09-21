import Link from "next/link";
import { formatMoney, formatMoneyCompact } from "@/lib/economy/format";
import { CURRENCY } from "@/config/economy";
import type { PlayerState } from "@/services/player/state";

/**
 * The persistent HUD strip: who you are on the left, your money in the middle,
 * your company on the right. Money is read from the server on every render -
 * the client never holds an authoritative balance.
 */
export function TopBar({ player }: { player: PlayerState }) {
  const { profile, company, netWorth } = player;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-ink-700/70 bg-ink-950/85 px-4 backdrop-blur">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-[family-name:var(--font-display)] text-sm font-black text-white"
        >
          W
        </span>
        <span className="hidden font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-slate-200 sm:block">
          WORLD ECONOMY
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <div
          className="flex items-baseline gap-2 rounded-xl border border-cash-500/30 bg-cash-500/10 px-3 py-1.5"
          title={CURRENCY.disclaimer}
        >
          <span className="text-[10px] font-semibold tracking-wider text-lime-300/80 uppercase">
            Cash
          </span>
          <span className="tnum font-[family-name:var(--font-display)] text-lg font-bold text-cash-400">
            {formatMoney(profile.cash)}
          </span>
        </div>

        <div className="hidden items-baseline gap-2 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-1.5 md:flex">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Net worth
          </span>
          <span className="tnum font-[family-name:var(--font-display)] text-lg font-bold text-slate-100">
            {formatMoneyCompact(netWorth)}
          </span>
        </div>

        {company ? (
          <Link
            href="/company"
            className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-1.5 hover:border-brand-400/60"
          >
            <span className="font-[family-name:var(--font-display)] text-xs font-bold text-brand-400">
              {company.ticker}
            </span>
            <span className="hidden max-w-[16ch] truncate text-xs text-slate-300 lg:block">
              {company.name}
            </span>
          </Link>
        ) : null}

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-danger-500/50 hover:text-rose-200"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
