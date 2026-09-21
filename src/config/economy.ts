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
  /** Hard ceiling on the offline cap, however many warehouses you own. */
  offlineCapCeilingHours: 72,
  /** Seconds before a business can be worked by hand again. */
  workCooldownSeconds: 15,
  /** Highest level a business can reach. */
  maxBuildingLevel: 5,
} as const;

/**
 * Progression curves. These mirror production_multiplier(), upgrade_cost(),
 * worker_cost() and max_workers() in the migrations, so the UI can show a
 * player what something will cost before they commit to it.
 *
 * The database is what actually charges them. If these ever disagree, the
 * database wins and the UI is the thing that is wrong.
 */
export const PROGRESSION = {
  /** Output multiplier from level: 1x at level 1, 3x at level 5. */
  levelMultiplier: (level: number) => 1 + 0.5 * (Math.max(level, 1) - 1),
  /** Each worker adds 12%. */
  workerMultiplier: (workers: number) => 1 + 0.12 * Math.max(workers, 0),
  /** Combined output multiplier. */
  outputMultiplier: (level: number, workers: number) =>
    PROGRESSION.levelMultiplier(level) * PROGRESSION.workerMultiplier(workers),
  /** Worker slots at a given level. */
  maxWorkers: (level: number) => Math.max(level, 1) * 2,
  /** Cost to reach the next level. */
  upgradeCost: (buildCost: number, level: number) =>
    Math.round(buildCost * 0.75 * Math.max(level, 1) * 100) / 100,
  /** Cost of one more worker. */
  workerCost: (buildCost: number) => Math.round(buildCost * 0.05 * 100) / 100,
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
