import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Badge,
  ButtonLink,
  EmptyState,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ECONOMY, PROGRESSION, ZONES, type ZoneKey } from "@/config/economy";
import { formatMoney } from "@/lib/economy/format";
import { getCurrentPlayer } from "@/services/player/state";
import { getMyBuildings, getResources } from "@/services/economy/read";
import {
  collectAllAction,
  hireWorkerAction,
  upgradeBusinessAction,
  workBusinessAction,
} from "@/services/economy/actions";

export const metadata: Metadata = { title: "Businesses" };

const { outputMultiplier, upgradeCost, workerCost } = PROGRESSION;

export default async function BusinessPage() {
  const [player, buildings, resources] = await Promise.all([
    getCurrentPlayer(),
    getMyBuildings(),
    getResources(),
  ]);

  if (!player) redirect("/login");

  const prices = new Map(resources.map((r) => [r.key, r.price]));
  const pendingTotal = buildings.reduce((sum, b) => sum + b.pending, 0);

  const hourlyValue = buildings.reduce((sum, b) => {
    if (!b.type.outputResource) return sum;
    const price = prices.get(b.type.outputResource) ?? 0;
    return sum + b.type.outputPerHour * outputMultiplier(b.level, b.workers) * price;
  }, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
            Businesses
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Work them by hand for an instant batch, or let them run and collect later.
          </p>
        </div>
        {buildings.length > 0 ? (
          <ActionForm
            action={collectAllAction}
            label={pendingTotal > 0 ? `Collect everything (${pendingTotal})` : "Collect everything"}
            busyLabel="Collecting…"
            variant="money"
            size="md"
          />
        ) : null}
      </div>

      {buildings.length === 0 ? (
        <Panel>
          <EmptyState
            title="No businesses yet"
            body="Buy a plot, then build your first business on it. A farm on rural land is the cheapest way in."
            action={
              <ButtonLink href="/build" variant="money">
                Build a business
              </ButtonLink>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Businesses" value={String(buildings.length)} />
            <Stat label="Waiting to collect" value={String(pendingTotal)} tone="brand" sub="units of goods" />
            <Stat
              label="Output value"
              value={`${formatMoney(hourlyValue)}/hr`}
              tone="money"
              sub="at current market prices"
            />
          </div>

          <div className="grid gap-4">
            {buildings.map((building) => {
              const zone = building.plot ? ZONES[building.plot.zone as ZoneKey] : null;
              const mult = outputMultiplier(building.level, building.workers);
              const perHour = building.type.outputPerHour * mult;
              const canWork = building.type.workYield > 0;
              const onCooldown = building.workCooldownRemaining > 0;
              const atMaxLevel = building.level >= ECONOMY.maxBuildingLevel;
              const workersFull = building.workers >= building.maxWorkers;

              return (
                <Panel key={building.id}>
                  <PanelHeader
                    title={building.type.name}
                    hint={building.type.description}
                    action={
                      <div className="flex shrink-0 items-center gap-2">
                        {zone ? <Badge color={zone.color}>{zone.label}</Badge> : null}
                        <Badge>Level {building.level}</Badge>
                      </div>
                    }
                  />

                  <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Detail
                        label="Output"
                        value={
                          building.type.sellsGoods
                            ? `${Math.round(perHour)} sold/hr`
                            : building.type.outputResource
                              ? `${perHour.toFixed(1)}/hr`
                              : "—"
                        }
                      />
                      <Detail
                        label="Waiting"
                        value={building.pending > 0 ? String(building.pending) : "—"}
                        tone={building.pending > 0 ? "money" : "default"}
                      />
                      <Detail
                        label="Workers"
                        value={`${building.workers} / ${building.maxWorkers}`}
                      />
                      <Detail label="Boost" value={`${mult.toFixed(2)}x`} />
                    </dl>

                    <div className="flex flex-wrap items-start gap-2">
                      {canWork ? (
                        <ActionForm
                          action={workBusinessAction}
                          hidden={{ buildingId: building.id }}
                          label={onCooldown ? `Work (${building.workCooldownRemaining}s)` : "Work"}
                          busyLabel="Working…"
                          variant="money"
                          disabled={onCooldown}
                        />
                      ) : null}

                      <ActionForm
                        action={upgradeBusinessAction}
                        hidden={{ buildingId: building.id }}
                        label={
                          atMaxLevel
                            ? "Max level"
                            : `Upgrade · ${formatMoney(upgradeCost(building.type.buildCost, building.level))}`
                        }
                        busyLabel="Upgrading…"
                        variant="ghost"
                        disabled={atMaxLevel}
                      />

                      <ActionForm
                        action={hireWorkerAction}
                        hidden={{ buildingId: building.id }}
                        label={
                          workersFull
                            ? "No slots"
                            : `Hire · ${formatMoney(workerCost(building.type.buildCost))}`
                        }
                        busyLabel="Hiring…"
                        variant="ghost"
                        disabled={workersFull}
                      />
                    </div>
                  </div>

                  {building.type.inputResource ? (
                    <p className="border-t border-ink-700/70 px-5 py-3 text-xs text-slate-500">
                      Consumes {building.type.inputPerOutput} {building.type.inputResource} per
                      unit. It stops producing if you run out.
                    </p>
                  ) : null}
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "money";
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </dt>
      <dd
        className={`tnum mt-0.5 text-sm font-bold ${
          tone === "money" ? "text-cash-400" : "text-slate-100"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
