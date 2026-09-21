import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, Panel, PanelHeader } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ZONES, type ZoneKey } from "@/config/economy";
import { formatMoney, toAmount } from "@/lib/economy/format";
import { getCurrentPlayer } from "@/services/player/state";
import { getBusinessTypes, getMyBuildings, getResources } from "@/services/economy/read";
import { buildBusinessAction } from "@/services/economy/actions";

export const metadata: Metadata = { title: "Build" };

export default async function BuildPage() {
  const [player, types, buildings, resources] = await Promise.all([
    getCurrentPlayer(),
    getBusinessTypes(),
    getMyBuildings(),
    getResources(),
  ]);

  if (!player) redirect("/login");

  const cash = toAmount(player.profile.cash);
  const built = new Set(buildings.map((b) => b.plotId));
  const emptyPlots = player.plots.filter((plot) => !built.has(plot.id));
  const prices = new Map(resources.map((r) => [r.key, r.price]));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
          Build
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Each plot holds one business, and location decides what you can put there.
        </p>
      </div>

      {emptyPlots.length === 0 ? (
        <Panel>
          <EmptyState
            title="No empty land"
            body="Every plot you own already has a business on it. Buy more land to keep expanding."
            action={
              <ButtonLink href="/land" variant="money">
                Buy land
              </ButtonLink>
            }
          />
        </Panel>
      ) : (
        emptyPlots.map((plot) => {
          const zone = ZONES[plot.zone as ZoneKey];
          const allowed = types.filter((t) => t.allowedZones.includes(plot.zone));

          return (
            <Panel key={plot.id}>
              <PanelHeader
                title={`${zone.label} plot`}
                hint={`Grid ${plot.grid_x}, ${plot.grid_z} · ${zone.blurb}`}
                action={<Badge color={zone.color}>Empty</Badge>}
              />

              {allowed.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-400">
                  Nothing can be built in this district yet. More business types arrive in
                  later phases.
                </p>
              ) : (
                <ul className="divide-y divide-ink-700/60">
                  {allowed.map((type) => {
                    const affordable = cash >= type.buildCost;
                    const outputPrice = type.outputResource
                      ? (prices.get(type.outputResource) ?? 0)
                      : 0;
                    const hourly = type.outputPerHour * outputPrice;

                    return (
                      <li
                        key={type.key}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-slate-100">
                              {type.name}
                            </h3>
                            {type.outputResource ? (
                              <Badge>{type.outputResource}</Badge>
                            ) : type.sellsGoods ? (
                              <Badge>sells goods</Badge>
                            ) : (
                              <Badge>+{type.offlineBonusHours}h offline</Badge>
                            )}
                          </div>
                          <p className="mt-1 max-w-xl text-xs text-slate-400">
                            {type.description}
                          </p>
                          <p className="tnum mt-1.5 text-xs text-slate-500">
                            {type.outputResource
                              ? `${type.outputPerHour}/hr · about ${formatMoney(hourly)}/hr at today's price`
                              : type.sellsGoods
                                ? `Sells ${type.outputPerHour} goods/hr from your inventory`
                                : "No output of its own"}
                            {type.workYield > 0 ? ` · ${type.workYield} per shift worked` : ""}
                          </p>
                        </div>

                        <div className="text-right">
                          <div
                            className={`tnum font-[family-name:var(--font-display)] text-lg font-bold ${
                              affordable ? "text-cash-400" : "text-slate-500"
                            }`}
                          >
                            {formatMoney(type.buildCost)}
                          </div>
                          <ActionForm
                            action={buildBusinessAction}
                            hidden={{ plotId: plot.id, businessType: type.key }}
                            label={affordable ? "Build" : "Too expensive"}
                            busyLabel="Building…"
                            variant={affordable ? "money" : "ghost"}
                            disabled={!affordable}
                            className="mt-1.5"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          );
        })
      )}
    </div>
  );
}
