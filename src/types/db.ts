/**
 * Hand-written database types.
 *
 * Money and other `numeric` columns arrive from PostgREST as strings, which is
 * deliberate: it preserves exact decimal values. Parse with `toAmount()` at the
 * point of display rather than treating them as numbers here.
 */

export type PlotZone =
  | "downtown"
  | "commercial"
  | "industrial"
  | "residential"
  | "rural"
  | "mining"
  | "waterfront"
  | "entertainment"
  | "gambling";

export type CompanyIndustry =
  | "agriculture"
  | "mining"
  | "manufacturing"
  | "retail"
  | "logistics"
  | "entertainment"
  | "services";

export type LedgerType =
  | "STARTING_BALANCE"
  | "ADMIN_GRANT"
  | "LAND_PURCHASE"
  | "BUILDING_PURCHASE"
  | "BUILDING_UPGRADE"
  | "WORKER_HIRE"
  | "WORK_REWARD"
  | "BUSINESS_REVENUE"
  | "RESOURCE_PURCHASE"
  | "RESOURCE_SALE";

export type InventoryTransactionType =
  | "PRODUCTION"
  | "WORK_REWARD"
  | "CONSUMED"
  | "MARKET_BUY"
  | "MARKET_SELL"
  | "STORE_SALE"
  | "ADMIN_GRANT";

export type Profile = {
  id: string;
  username: string;
  /** numeric(20,2) as string */
  cash: string;
  is_admin: boolean;
  onboarded_at: string | null;
  last_active_at: string;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  owner_id: string;
  name: string;
  ticker: string;
  industry: CompanyIndustry;
  logo_url: string | null;
  level: number;
  total_revenue: string;
  total_expenses: string;
  company_value: string;
  stock_price: string;
  created_at: string;
  updated_at: string;
};

export type Plot = {
  id: string;
  grid_x: number;
  grid_z: number;
  zone: PlotZone;
  size: number;
  purchase_price: string;
  building_capacity: number;
  owner_id: string | null;
  is_purchasable: boolean;
  is_starter_eligible: boolean;
  acquired_at: string | null;
  created_at: string;
};

export type PlayerTransaction = {
  id: number;
  player_id: string;
  type: LedgerType;
  amount: string;
  balance_before: string;
  balance_after: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

export type GameConfigRow = {
  key: string;
  value: string;
  description: string;
  updated_at: string;
};

export type OnboardingResult = {
  company_id: string;
  ticker: string;
  starting_cash: number;
  plot_ids: string[];
};

export type ResourceType = {
  key: string;
  name: string;
  base_price: string;
  price: string;
  tier: "raw" | "refined";
  sort_order: number;
  updated_at: string;
};

export type BusinessType = {
  key: string;
  name: string;
  description: string;
  build_cost: string;
  allowed_zones: PlotZone[];
  output_resource: string | null;
  output_per_hour: string;
  input_resource: string | null;
  input_per_output: string;
  work_yield: string;
  sells_goods: boolean;
  sell_rate_share: string;
  offline_bonus_hours: number;
  sort_order: number;
};

export type Building = {
  id: string;
  plot_id: string;
  owner_id: string;
  business_type: string;
  level: number;
  workers: number;
  last_collected_at: string;
  last_worked_at: string | null;
  invested_value: string;
  created_at: string;
  updated_at: string;
};

export type InventoryRow = {
  owner_id: string;
  resource_key: string;
  quantity: string;
  updated_at: string;
};

export type PendingProduction = {
  building_id: string;
  business_type: string;
  business_name: string;
  output_resource: string | null;
  sells_goods: boolean;
  hours: number;
  pending: number;
};

/** What work_business() returns. */
export type WorkResult = {
  resource: string;
  quantity: number;
  tip: number;
  cooldown_seconds: number;
};

/** What collect_all() returns. */
export type CollectResult = {
  earned: number;
  goods: Record<string, number>;
};
