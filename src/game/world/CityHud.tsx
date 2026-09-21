"use client";

import { ZONES } from "@/config/economy";
import { formatMoney } from "@/lib/economy/format";
import type { WorldPlot } from "./grid";

/**
 * The map's interface: identity and money along the top, a detail panel for
 * whichever plot is selected, and a district key.
 *
 * Purely presentational. Selecting a plot reads persisted data; it never
 * changes anything, and buying land will go through a server action when the
 * expansion phase adds it.
 */

export function CityHud({
  playerName,
  companyLabel,
  cash,
  plotCount,
  selected,
  onClose,
  worldStats,
}: {
  playerName: string;
  companyLabel: string | null;
  cash: string;
  plotCount: number;
  selected: WorldPlot | null;
  onClose: () => void;
  worldStats: { total: number; available: number };
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* Identity */}
      <div className="absolute top-3 left-3 rounded-xl border border-ink-700/80 bg-ink-950/80 px-3 py-2 backdrop-blur">
        <div className="text-sm font-semibold text-slate-100">{playerName}</div>
        {companyLabel ? (
          <div className="font-[family-name:var(--font-display)] text-[11px] font-bold tracking-wide text-brand-400">
            {companyLabel}
          </div>
        ) : null}
        <div className="tnum mt-0.5 text-[11px] text-slate-400">
          {plotCount} {plotCount === 1 ? "plot" : "plots"} owned
        </div>
      </div>

      {/* Money */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border border-cash-500/40 bg-ink-950/85 px-4 py-2 backdrop-blur">
        <span className="tnum font-[family-name:var(--font-display)] text-lg font-bold text-cash-400">
          {formatMoney(cash)}
        </span>
      </div>

      {/* World summary */}
      <div className="absolute top-3 right-3 rounded-xl border border-ink-700/80 bg-ink-950/80 px-3 py-2 text-right backdrop-blur">
        <div className="tnum text-sm font-semibold text-slate-100">
          {worldStats.available}
        </div>
        <div className="text-[11px] text-slate-400">
          of {worldStats.total} plots unclaimed
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-3 left-3 space-y-1 rounded-xl border border-ink-700/80 bg-ink-950/75 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
        <div>
          <Key>Drag</Key> pan · <Key>Scroll</Key> zoom · <Key>Right-drag</Key> rotate
        </div>
        <div>
          <Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key> pan · click a plot to
          inspect
        </div>
      </div>

      {/* District key */}
      <div className="absolute right-3 bottom-3 hidden max-w-[11rem] rounded-xl border border-ink-700/80 bg-ink-950/75 p-2.5 backdrop-blur lg:block">
        <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Districts
        </div>
        <ul className="grid gap-1">
          {Object.entries(ZONES).map(([key, zone]) => (
            <li key={key} className="flex items-center gap-2 text-[11px] text-slate-300">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: zone.color }}
              />
              {zone.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Selected plot */}
      {selected ? (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[min(27rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-ink-600 bg-ink-950/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className="text-[11px] font-bold tracking-wide uppercase"
                style={{ color: ZONES[selected.zone].color }}
              >
                {ZONES[selected.zone].label}
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-white">
                {selected.isMine
                  ? "Your plot"
                  : selected.ownerId
                    ? (selected.ownerLabel ?? "Claimed plot")
                    : selected.isPurchasable
                      ? "Unclaimed plot"
                      : "City landmark"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close plot details"
              className="rounded-lg border border-ink-600 px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
            >
              Esc
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-400">{ZONES[selected.zone].blurb}</p>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Detail label="Location" value={`${selected.gridX}, ${selected.gridZ}`} />
            <Detail
              label={selected.ownerId ? "Value" : "Price"}
              value={formatMoney(selected.price)}
            />
            <Detail label="Slots" value={String(selected.buildingCapacity)} />
          </dl>

          <p className="mt-3 text-[11px] text-slate-500">
            {selected.isMine
              ? "Building goes here next: a farm first, then everything else."
              : selected.ownerId
                ? "Owned by another player. You'll be able to visit their shop once shops exist."
                : selected.isPurchasable
                  ? "Buying land unlocks in the expansion phase."
                  : "This one is never for sale."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700/70 bg-ink-900/60 px-2 py-1.5">
      <dt className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="tnum text-sm font-bold text-slate-100">{value}</dd>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-ink-500 bg-ink-800 px-1.5 py-0.5 font-sans text-[10px] font-bold text-slate-200">
      {children}
    </kbd>
  );
}
