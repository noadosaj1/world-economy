"use client";

import { ZONES } from "@/config/economy";
import { formatMoney } from "@/lib/economy/format";
import type { PlayerStatus } from "@/game/player/PlayerRig";
import type { WorldPlot } from "./grid";

/**
 * The in-world HUD.
 *
 * Identity top-left, money top-centre, context bottom-centre - and a
 * contextual [E] prompt whenever the player is standing somewhere that does
 * something. Purely a display layer over the canvas.
 */
export function WorldHud({
  playerName,
  companyLabel,
  cash,
  status,
  inspected,
  onInspect,
  onCloseInspect,
}: {
  playerName: string;
  companyLabel: string | null;
  cash: string;
  status: PlayerStatus | null;
  inspected: WorldPlot | null;
  onInspect: () => void;
  onCloseInspect: () => void;
}) {
  const plot = status?.plot ?? null;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Identity */}
      <div className="absolute top-3 left-3 rounded-xl border border-ink-700/80 bg-ink-950/75 px-3 py-2 backdrop-blur">
        <div className="text-sm font-semibold text-slate-100">{playerName}</div>
        {companyLabel ? (
          <div className="font-[family-name:var(--font-display)] text-[11px] font-bold tracking-wide text-brand-400">
            {companyLabel}
          </div>
        ) : null}
      </div>

      {/* Money */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border border-cash-500/40 bg-ink-950/80 px-4 py-2 backdrop-blur">
        <span className="tnum font-[family-name:var(--font-display)] text-lg font-bold text-cash-400">
          {formatMoney(cash)}
        </span>
      </div>

      {/* Where am I */}
      <div className="absolute top-3 right-3 rounded-xl border border-ink-700/80 bg-ink-950/75 px-3 py-2 text-right backdrop-blur">
        {plot ? (
          <>
            <div
              className="text-[11px] font-bold tracking-wide uppercase"
              style={{ color: ZONES[plot.zone].color }}
            >
              {ZONES[plot.zone].label}
            </div>
            <div className="tnum text-[11px] text-slate-400">
              {plot.gridX}, {plot.gridZ}
            </div>
          </>
        ) : (
          <div className="text-[11px] font-bold tracking-wide text-slate-400 uppercase">
            On the road
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-3 left-3 space-y-1 rounded-xl border border-ink-700/80 bg-ink-950/70 px-3 py-2 text-[11px] text-slate-400 backdrop-blur">
        <div>
          <Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key> move ·{" "}
          <Key>Shift</Key> run
        </div>
        <div>Drag to look · scroll to zoom</div>
      </div>

      {/* Contextual interaction prompt */}
      {plot && !inspected ? (
        <button
          type="button"
          onClick={onInspect}
          className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-brand-400/60 bg-ink-950/90 px-4 py-2.5 text-sm font-semibold text-slate-100 backdrop-blur transition-colors hover:border-brand-400 hover:bg-ink-900"
        >
          <Key>E</Key>{" "}
          {plot.isMine
            ? "Inspect your plot"
            : plot.ownerId
              ? `Look at ${plot.ownerLabel ?? "this business"}`
              : plot.isPurchasable
                ? "Inspect this plot"
                : "Look around"}
        </button>
      ) : null}

      {/* Plot inspector */}
      {inspected ? (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-ink-600 bg-ink-950/95 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className="text-[11px] font-bold tracking-wide uppercase"
                style={{ color: ZONES[inspected.zone].color }}
              >
                {ZONES[inspected.zone].label}
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-white">
                {inspected.isMine
                  ? "Your plot"
                  : (inspected.ownerLabel ?? (inspected.isPurchasable ? "Unclaimed plot" : "City landmark"))}
              </h2>
            </div>
            <button
              type="button"
              onClick={onCloseInspect}
              aria-label="Close"
              className="rounded-lg border border-ink-600 px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
            >
              Esc
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-400">{ZONES[inspected.zone].blurb}</p>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Detail label="Grid" value={`${inspected.gridX}, ${inspected.gridZ}`} />
            <Detail
              label={inspected.ownerId ? "Value" : "Price"}
              value={formatMoney(inspected.price)}
            />
            <Detail label="Slots" value={String(inspected.buildingCapacity)} />
          </dl>

          <p className="mt-3 text-[11px] text-slate-500">
            {inspected.isMine
              ? "Building goes here in the next phase - a farm first, then everything else."
              : inspected.ownerId
                ? "Owned by another player. You'll be able to visit their shop once shops exist."
                : inspected.isPurchasable
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
