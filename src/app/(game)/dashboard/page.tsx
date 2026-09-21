import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ButtonLink,
  Badge,
  EmptyState,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { CURRENCY, ZONES } from "@/config/economy";
import { formatMoney, formatMoneyPrecise, toAmount } from "@/lib/economy/format";
import {
  getCurrentPlayer,
  getRecentTransactions,
} from "@/services/player/state";
import type { LedgerType } from "@/types/db";

export const metadata: Metadata = { title: "Dashboard" };

const LEDGER_LABELS: Record<LedgerType, string> = {
  STARTING_BALANCE: "Starting balance",
  LAND_PURCHASE: "Land purchase",
  ADMIN_GRANT: "Adjustment",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [player, transactions, params] = await Promise.all([
    getCurrentPlayer(),
    getRecentTransactions(8),
    searchParams,
  ]);

  if (!player) redirect("/login");
  const { profile, company, plots, netWorth } = player;
  const landValue = plots.reduce((sum, p) => sum + toAmount(p.purchase_price), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {params.welcome ? (
        <Panel className="border-cash-500/40 bg-cash-500/10 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-lime-200">
            {company?.name} is open for business.
          </h2>
          <p className="mt-1 text-sm text-lime-100/80">
            You have {formatMoney(profile.cash)} and a plot of land waiting. Go and stand
            on it.
          </p>
          <ButtonLink href="/world" variant="money" className="mt-4">
            Enter the world
          </ButtonLink>
        </Panel>
      ) : null}

      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
          {company?.name ?? profile.username}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Playing as{" "}
          <span className="font-semibold text-slate-200">{profile.username}</span>
          {company ? (
            <>
              {" · "}
              <span className="font-[family-name:var(--font-display)] font-bold text-brand-400">
                {company.ticker}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash" value={formatMoney(profile.cash)} tone="money" sub="Spendable now" />
        <Stat label="Net worth" value={formatMoney(netWorth)} sub="Cash + land" />
        <Stat
          label="Land"
          value={`${plots.length} ${plots.length === 1 ? "plot" : "plots"}`}
          sub={formatMoney(landValue)}
        />
        <Stat
          label="Share price"
          value={company ? formatMoneyPrecise(company.stock_price) : "—"}
          tone="brand"
          sub="Trading opens in a later phase"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Your land"
            hint="Where your empire gets built."
            action={
              <ButtonLink href="/world" variant="ghost" size="sm">
                View in world
              </ButtonLink>
            }
          />
          {plots.length === 0 ? (
            <EmptyState
              title="No land yet"
              body="Something went wrong with your starter plot. Contact an admin."
            />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {plots.map((plot) => {
                const zone = ZONES[plot.zone];
                return (
                  <li
                    key={plot.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge color={zone.color}>{zone.label}</Badge>
                        <span className="tnum text-xs text-slate-500">
                          {plot.grid_x}, {plot.grid_z}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">{zone.blurb}</p>
                    </div>
                    <div className="text-right">
                      <div className="tnum text-sm font-semibold text-slate-200">
                        {formatMoney(plot.purchase_price)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {plot.building_capacity} building slot
                        {plot.building_capacity === 1 ? "" : "s"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Money ledger" hint="Every change to your balance, in order." />
          {transactions.length === 0 ? (
            <EmptyState title="Nothing yet" body="Your transactions will show up here." />
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {transactions.map((tx) => {
                const amount = toAmount(tx.amount);
                const positive = amount >= 0;
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">
                        {LEDGER_LABELS[tx.type] ?? tx.type}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {tx.description ?? new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div
                      className={`tnum text-sm font-bold ${
                        positive ? "text-cash-400" : "text-rose-300"
                      }`}
                    >
                      {positive ? "+" : "−"}
                      {formatMoney(Math.abs(amount))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="p-5">
        <PanelHeader title="What's next" hint="The roadmap, in build order." />
        <ul className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
          <li>▸ Place your first business and work it by hand</li>
          <li>▸ Resources, production chains and the player market</li>
          <li>▸ Shops, workers, vehicles and property rental</li>
          <li>▸ The stock market, so others can buy into your company</li>
          <li>▸ Seeing other players walking around the world</li>
          <li>▸ Billboards, then the gambling district</li>
        </ul>
      </Panel>

      <p className="text-xs text-slate-600">{CURRENCY.disclaimer}</p>
    </div>
  );
}
