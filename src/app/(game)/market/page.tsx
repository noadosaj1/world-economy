import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, Panel, PanelHeader, TextInput } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { formatMoney, formatMoneyPrecise, toAmount } from "@/lib/economy/format";
import { getCurrentPlayer } from "@/services/player/state";
import { getInventory, getResources } from "@/services/economy/read";
import {
  buyResourceAction,
  sellAllAction,
  sellResourceAction,
} from "@/services/economy/actions";

export const metadata: Metadata = { title: "Market" };

export default async function MarketPage() {
  const [player, resources, inventory] = await Promise.all([
    getCurrentPlayer(),
    getResources(),
    getInventory(),
  ]);

  if (!player) redirect("/login");
  const cash = toAmount(player.profile.cash);

  const totalHeld = [...inventory.values()].reduce((sum, qty) => sum + qty, 0);
  const totalValue = resources.reduce(
    (sum, r) => sum + (inventory.get(r.key) ?? 0) * r.price,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
            Market
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            One price per good, set by the server. Selling pushes a price down, buying
            pushes it up - so what everyone trades moves the market.
          </p>
        </div>
        <ActionForm
          action={sellAllAction}
          label={
            totalHeld > 0
              ? `Sell everything · about ${formatMoney(totalValue)}`
              : "Sell everything"
          }
          busyLabel="Selling…"
          variant="money"
          size="md"
          disabled={totalHeld < 1}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {resources.map((resource) => {
          const held = inventory.get(resource.key) ?? 0;
          const drift = resource.drift;
          const affordable = Math.floor(cash / resource.price);

          return (
            <Panel key={resource.key}>
              <PanelHeader
                title={resource.name}
                hint={resource.tier === "raw" ? "Raw good" : "Refined good"}
                action={
                  <Badge
                    color={drift > 0.01 ? "#84cc16" : drift < -0.01 ? "#f43f5e" : undefined}
                  >
                    {drift >= 0 ? "+" : ""}
                    {(drift * 100).toFixed(1)}%
                  </Badge>
                }
              />

              <div className="space-y-4 p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="tnum font-[family-name:var(--font-display)] text-3xl font-bold text-slate-100">
                      {formatMoneyPrecise(resource.price)}
                    </div>
                    <div className="text-xs text-slate-500">
                      per unit · base {formatMoneyPrecise(resource.basePrice)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-sm font-bold text-cash-400">{held}</div>
                    <div className="text-xs text-slate-500">in your inventory</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ActionForm
                    action={sellResourceAction}
                    hidden={{ resource: resource.key }}
                    label="Sell"
                    busyLabel="Selling…"
                    variant="money"
                    disabled={held < 1}
                  >
                    <TextInput
                      name="quantity"
                      type="number"
                      min={1}
                      max={Math.max(1, Math.floor(held))}
                      step={1}
                      defaultValue={Math.min(10, Math.max(1, Math.floor(held)))}
                      aria-label={`Quantity of ${resource.name} to sell`}
                      className="h-9"
                    />
                  </ActionForm>

                  <ActionForm
                    action={buyResourceAction}
                    hidden={{ resource: resource.key }}
                    label="Buy"
                    busyLabel="Buying…"
                    variant="ghost"
                    disabled={affordable < 1}
                  >
                    <TextInput
                      name="quantity"
                      type="number"
                      min={1}
                      max={Math.max(1, affordable)}
                      step={1}
                      defaultValue={Math.min(10, Math.max(1, affordable))}
                      aria-label={`Quantity of ${resource.name} to buy`}
                      className="h-9"
                    />
                  </ActionForm>
                </div>

                <p className="tnum text-xs text-slate-500">
                  You could afford {affordable} at this price · holding{" "}
                  {formatMoney(held * resource.price)} of {resource.name.toLowerCase()}
                </p>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
