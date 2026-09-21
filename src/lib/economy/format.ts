import { CURRENCY } from "@/config/economy";

const wholeMoney = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const preciseMoney = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Money comes out of Postgres as a numeric string to avoid float drift.
 * Parse it at the edge, once.
 */
export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** `$12,400` - for HUD and headline figures. */
export function formatMoney(value: string | number | null | undefined): string {
  return `${CURRENCY.symbol}${wholeMoney.format(toAmount(value))}`;
}

/** `$82.40` - for prices where cents matter. */
export function formatMoneyPrecise(value: string | number | null | undefined): string {
  return `${CURRENCY.symbol}${preciseMoney.format(toAmount(value))}`;
}

/** `$1.2M` - for leaderboards and tight spaces. */
export function formatMoneyCompact(value: string | number | null | undefined): string {
  const n = toAmount(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${CURRENCY.symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${CURRENCY.symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${CURRENCY.symbol}${Math.round(abs / 1_000)}K`;
  return `${sign}${CURRENCY.symbol}${wholeMoney.format(abs)}`;
}
