import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Panel, PanelHeader, Stat } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ZONES, type ZoneKey } from "@/config/economy";
import { formatMoney, toAmount } from "@/lib/economy/format";
import { getCurrentPlayer, getWorldPlots } from "@/services/player/state";
import { getMyBuildings } from "@/services/economy/read";
import { buyPlotAction } from "@/services/economy/actions";

export const metadata: Metadata = { title: "Land" };

/** How many plots to offer per district, cheapest first. */
const OFFERS_PER_ZONE = 3;

export default async function LandPage() {
  const [player, plots, buildings] = await Promise.all([
    getCurrentPlayer(),
    getWorldPlots(),
    getMyBuildings(),
  ]);

  if (!player) redirect("/login");

  const cash = toAmount(player.profile.cash);
  const builtOn = new Set(buildings.map((b) => b.plotId));
  const mine = plots.filter((p) => p.owner_id === player.profile.id);
  const available = plots.filter((p) => !p.owner_id && p.is_purchasable);

  // Group the cheapest few unclaimed plots per district into buyable offers.
  const offers = new Map<ZoneKey, typeof plots>();
  for (const plot of [...available].sort(
    (a, b) => toAmount(a.purchase_price) - toAmount(b.purchase_price),
  )) {
    const zone = plot.zone as ZoneKey;
    const list = offers.get(zone) ?? [];
    if (list.length < OFFERS_PER_ZONE) {
      list.push(plot);
      offers.set(zone, list);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
          Land
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Every plot is a real row in the database, and location decides what you can build
          there. Rural is cheapest; downtown costs the most.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Your plots" value={String(mine.length)} tone="money" />
        <Stat label="Unclaimed" value={String(available.length)} tone="brand" />
        <Stat label="Your cash" value={formatMoney(cash)} />
      </div>

      <Panel>
        <PanelHeader title="Your plots" hint="What you already own." />
        {mine.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">You don&apos;t own any land yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {mine.map((plot) => {
              const zone = ZONES[plot.zone as ZoneKey];
              const hasBuilding = builtOn.has(plot.id);
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
                  <Badge color={hasBuilding ? zone.color : undefined}>
                    {hasBuilding ? "Built" : "Empty"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="For sale"
          hint="The cheapest unclaimed plots in each district."
        />
        <div className="divide-y divide-ink-700/60">
          {[...offers.entries()].map(([zoneKey, zonePlots]) => {
            const zone = ZONES[zoneKey];
            return (
              <div key={zoneKey} className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: zone.color }}
                  />
                  <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-slate-100">
                    {zone.label}
                  </h3>
                </div>
                <p className="mt-0.5 mb-3 text-xs text-slate-400">{zone.blurb}</p>

                <ul className="grid gap-2 sm:grid-cols-3">
                  {zonePlots.map((plot) => {
                    const price = toAmount(plot.purchase_price);
                    const affordable = cash >= price;
                    return (
                      <li
                        key={plot.id}
                        className="rounded-xl border border-ink-700/70 bg-ink-800/40 p-3"
                      >
                        <div className="tnum text-xs text-slate-500">
                          Grid {plot.grid_x}, {plot.grid_z}
                        </div>
                        <div
                          className={`tnum font-[family-name:var(--font-display)] text-base font-bold ${
                            affordable ? "text-cash-400" : "text-slate-500"
                          }`}
                        >
                          {formatMoney(price)}
                        </div>
                        <ActionForm
                          action={buyPlotAction}
                          hidden={{ plotId: plot.id }}
                          label={affordable ? "Buy" : "Too expensive"}
                          busyLabel="Buying…"
                          variant={affordable ? "money" : "ghost"}
                          disabled={!affordable}
                          className="mt-2"
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
