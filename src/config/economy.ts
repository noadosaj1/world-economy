/**
 * Central economy configuration.
 *
 * IMPORTANT: these are *display defaults*, not the authority. The
 * `game_config` table in Postgres is the runtime source of truth for anything
 * the server acts on (starting cash, offline caps, world bounds), so the
 * economy can be retuned without a deploy. The values here mirror the seeded
 * defaults so the UI has something sensible before config loads, and so all
 * balance numbers live in one readable place.
 *
 * Never scatter balance constants through feature code - add them here.
 */

export const ECONOMY = {
  /** Cash granted when a player finishes onboarding. */
  startingCash: 10_000,
  /** Free plots handed out at onboarding. */
  starterPlotCount: 1,
  /** Offline production is credited for at most this many hours. */
  offlineCapHours: 24,
} as const;

/** The world grid. Mirrors world_* keys in game_config. */
export const WORLD = {
  gridMin: -12,
  gridMax: 12,
  /** World units per grid cell. Plots are one cell; gaps become roads. */
  cellSize: 20,
} as const;

export const CURRENCY = {
  symbol: "$",
  code: "WEC",
  /** Shown wherever the player might mistake this for real money. */
  disclaimer: "Fictional in-game currency. It has no real-world value.",
} as const;

/** Zone presentation + gameplay character. Prices themselves live in the DB. */
export const ZONES = {
  downtown: {
    label: "Downtown",
    color: "#6366f1",
    blurb: "Priciest land in the world. Unmatched customer traffic and ad visibility.",
  },
  commercial: {
    label: "Commercial",
    color: "#0ea5e9",
    blurb: "Solid footfall for shops and offices at a sane price.",
  },
  industrial: {
    label: "Industrial",
    color: "#f59e0b",
    blurb: "Cheap and roomy. The natural home for factories and warehouses.",
  },
  residential: {
    label: "Residential",
    color: "#22c55e",
    blurb: "Quiet streets. Good for housing and rental income.",
  },
  rural: {
    label: "Rural",
    color: "#84cc16",
    blurb: "The cheapest land there is, and the only place crops grow well.",
  },
  mining: {
    label: "Mining",
    color: "#a1a1aa",
    blurb: "Rocky ground with ore beneath it. Bring a mine.",
  },
  waterfront: {
    label: "Waterfront",
    color: "#06b6d4",
    blurb: "Docks and shipping lanes. Logistics thrive here.",
  },
  entertainment: {
    label: "Entertainment",
    color: "#ec4899",
    blurb: "Neon and crowds. Venues do well; so do billboards.",
  },
  gambling: {
    label: "Gambling District",
    color: "#a855f7",
    blurb: "The bright lights at the south end of the world.",
  },
} as const;

export type ZoneKey = keyof typeof ZONES;

export const ZONE_KEYS = Object.keys(ZONES) as ZoneKey[];

export const INDUSTRIES = {
  agriculture: "Agriculture",
  mining: "Mining",
  manufacturing: "Manufacturing",
  retail: "Retail",
  logistics: "Logistics",
  entertainment: "Entertainment",
  services: "Services",
} as const;

export type IndustryKey = keyof typeof INDUSTRIES;

export const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as IndustryKey[];
