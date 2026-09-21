import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, EmptyState, Panel, PanelHeader, Stat } from "@/components/ui";
import { INDUSTRIES, ZONES } from "@/config/economy";
import { formatMoney, formatMoneyPrecise, toAmount } from "@/lib/economy/format";
import { getCurrentPlayer } from "@/services/player/state";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login");

  const { company, plots, profile } = player;

  if (!company) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Panel>
          <EmptyState title="No company" body="You don't have a company yet." />
        </Panel>
      </div>
    );
  }

  const revenue = toAmount(company.total_revenue);
  const expenses = toAmount(company.total_expenses);
  const profit = revenue - expenses;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-4">
        <div
          aria-hidden
          className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-500/20 font-[family-name:var(--font-display)] text-xl font-black text-brand-400 ring-1 ring-brand-500/40"
        >
          {company.ticker.slice(0, 3)}
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
            {company.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge className="font-[family-name:var(--font-display)] tracking-widest">
              {company.ticker}
            </Badge>
            <Badge>{INDUSTRIES[company.industry]}</Badge>
            <Badge>Level {company.level}</Badge>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Company value" value={formatMoney(company.company_value)} tone="brand" />
        <Stat label="Share price" value={formatMoneyPrecise(company.stock_price)} />
        <Stat label="Revenue" value={formatMoney(revenue)} tone="money" sub="All time" />
        <Stat
          label="Profit"
          value={formatMoney(profit)}
          sub={`${formatMoney(expenses)} expenses`}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Holdings"
          hint={`${plots.length} plot${plots.length === 1 ? "" : "s"} · owner ${profile.username}`}
        />
        <ul className="divide-y divide-ink-700/60">
          {plots.map((plot) => {
            const zone = ZONES[plot.zone];
            return (
              <li key={plot.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="h-8 w-1.5 rounded-full"
                    style={{ backgroundColor: zone.color }}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{zone.label}</div>
                    <div className="tnum text-xs text-slate-500">
                      Grid {plot.grid_x}, {plot.grid_z}
                    </div>
                  </div>
                </div>
                <div className="tnum text-sm font-semibold text-slate-200">
                  {formatMoney(plot.purchase_price)}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="p-5">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-slate-200 uppercase">
          Not built yet
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Revenue, expenses and share price are real database columns, but nothing moves
          them yet - businesses, production and the stock market come in later phases.
          They read as zero because that is genuinely what your company has earned so far.
        </p>
      </Panel>
    </div>
  );
}
