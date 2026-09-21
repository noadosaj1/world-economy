import type { Metadata } from "next";
import { Badge, Panel, PanelHeader, Stat } from "@/components/ui";
import { ZONES, type ZoneKey } from "@/config/economy";
import { formatMoney, toAmount } from "@/lib/economy/format";
import { getCurrentPlayer, getWorldPlots } from "@/services/player/state";

export const metadata: Metadata = { title: "Land" };

export default async function LandPage() {
  const [player, plots] = await Promise.all([getCurrentPlayer(), getWorldPlots()]);
  const myId = player?.profile.id ?? null;

  const byZone = new Map<
    ZoneKey,
    { total: number; owned: number; available: number; cheapest: number }
  >();

  for (const plot of plots) {
    const zone = plot.zone as ZoneKey;
    const entry =
      byZone.get(zone) ?? { total: 0, owned: 0, available: 0, cheapest: Number.POSITIVE_INFINITY };
    entry.total += 1;
    if (plot.owner_id) entry.owned += 1;
    if (!plot.owner_id && plot.is_purchasable) {
      entry.available += 1;
      entry.cheapest = Math.min(entry.cheapest, toAmount(plot.purchase_price));
    }
    byZone.set(zone, entry);
  }

  const mine = plots.filter((p) => p.owner_id && p.owner_id === myId);
  const totalAvailable = plots.filter((p) => !p.owner_id && p.is_purchasable).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
          Land
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          The world is a fixed grid. Every plot below is a real row in the database, and
          location decides what it&apos;s good for.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Plots in world" value={String(plots.length)} />
        <Stat label="Unclaimed" value={String(totalAvailable)} tone="brand" />
        <Stat label="Yours" value={String(mine.length)} tone="money" />
      </div>

      <Panel>
        <PanelHeader title="Districts" hint="Buying land unlocks in the expansion phase." />
        <ul className="divide-y divide-ink-700/60">
          {[...byZone.entries()].map(([zone, stats]) => {
            const meta = ZONES[zone];
            return (
              <li key={zone} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-9 w-1.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-[family-name:var(--font-display)] text-sm font-bold text-slate-100">
                          {meta.label}
                        </span>
                        {mine.some((p) => p.zone === zone) ? (
                          <Badge color={meta.color}>You own land here</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 max-w-lg text-xs text-slate-400">{meta.blurb}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-sm font-semibold text-slate-200">
                      {Number.isFinite(stats.cheapest)
                        ? `from ${formatMoney(stats.cheapest)}`
                        : "sold out"}
                    </div>
                    <div className="tnum text-[11px] text-slate-500">
                      {stats.available} of {stats.total} free
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
