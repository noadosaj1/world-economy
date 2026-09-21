import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState, Panel, PanelHeader, Stat } from "@/components/ui";
import { formatMoney, formatMoneyPrecise } from "@/lib/economy/format";
import { getCurrentPlayer } from "@/services/player/state";
import { getInventory, getResources } from "@/services/economy/read";
import { ActionForm } from "@/components/ActionForm";
import { sellAllAction } from "@/services/economy/actions";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const [player, resources, inventory] = await Promise.all([
    getCurrentPlayer(),
    getResources(),
    getInventory(),
  ]);

  if (!player) redirect("/login");

  const rows = resources.map((resource) => {
    const quantity = inventory.get(resource.key) ?? 0;
    return { ...resource, quantity, value: quantity * resource.price };
  });

  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const totalUnits = rows.reduce((sum, row) => sum + row.quantity, 0);
  const anything = totalUnits > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
          Inventory
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Everything your businesses have produced. Sell it on the market, or feed it into
          a mill or foundry.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Goods held" value={String(Math.round(totalUnits))} sub="units" />
        <Stat
          label="Worth"
          value={formatMoney(totalValue)}
          tone="money"
          sub="at current market prices"
        />
      </div>

      <Panel>
        <PanelHeader
          title="Goods"
          hint="Quantities are exact - the database is the only thing that writes them."
          action={
            <div className="flex shrink-0 items-center gap-2">
              <ButtonLink href="/market" variant="ghost" size="sm">
                Trade
              </ButtonLink>
              <ActionForm
                action={sellAllAction}
                label="Sell everything"
                busyLabel="Selling…"
                variant="money"
                disabled={!anything}
              />
            </div>
          }
        />

        {!anything ? (
          <EmptyState
            title="Nothing yet"
            body="Work one of your businesses, or let it run and collect what it produced."
            action={
              <ButtonLink href="/business" variant="money">
                Go to your businesses
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {rows
              .filter((row) => row.quantity > 0)
              .map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">
                          {row.name}
                        </span>
                        <Badge>{row.tier}</Badge>
                      </div>
                      <div className="tnum text-xs text-slate-500">
                        {formatMoneyPrecise(row.price)} per unit
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-sm font-bold text-slate-100">
                      {Math.round(row.quantity)}
                    </div>
                    <div className="tnum text-xs text-cash-400">{formatMoney(row.value)}</div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
