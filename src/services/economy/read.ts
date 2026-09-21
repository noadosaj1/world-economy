import { tryCreateClient } from "@/lib/supabase/server";
import { toAmount } from "@/lib/economy/format";
import type {
  Building,
  BusinessType,
  InventoryRow,
  PendingProduction,
  Plot,
  ResourceType,
} from "@/types/db";

/**
 * Read models for the economy.
 *
 * Everything goes through the player's own RLS-scoped client, so this module
 * physically cannot read another player's inventory. Buildings and prices are
 * public, which is what lets the map show who owns what.
 */

export type ResourceView = {
  key: string;
  name: string;
  price: number;
  basePrice: number;
  /** Price movement against the base, as a fraction. */
  drift: number;
  tier: "raw" | "refined";
};

export type BusinessTypeView = {
  key: string;
  name: string;
  description: string;
  buildCost: number;
  allowedZones: string[];
  outputResource: string | null;
  outputPerHour: number;
  inputResource: string | null;
  inputPerOutput: number;
  workYield: number;
  sellsGoods: boolean;
  offlineBonusHours: number;
};

export type BuildingView = {
  id: string;
  plotId: string;
  businessType: string;
  level: number;
  workers: number;
  maxWorkers: number;
  investedValue: number;
  lastCollectedAt: string;
  lastWorkedAt: string | null;
  /** Seconds until this business can be worked by hand again. */
  workCooldownRemaining: number;
  type: BusinessTypeView;
  plot: Plot | null;
  pending: number;
};

export async function getResources(): Promise<ResourceView[]> {
  const supabase = await tryCreateClient();
  if (!supabase) return [];

  const { data } = await supabase.from("resource_types").select("*").order("sort_order");
  return ((data ?? []) as ResourceType[]).map((row) => {
    const price = toAmount(row.price);
    const basePrice = toAmount(row.base_price);
    return {
      key: row.key,
      name: row.name,
      price,
      basePrice,
      drift: basePrice > 0 ? price / basePrice - 1 : 0,
      tier: row.tier,
    };
  });
}

export async function getBusinessTypes(): Promise<BusinessTypeView[]> {
  const supabase = await tryCreateClient();
  if (!supabase) return [];

  const { data } = await supabase.from("business_types").select("*").order("sort_order");
  return ((data ?? []) as BusinessType[]).map(toBusinessTypeView);
}

function toBusinessTypeView(row: BusinessType): BusinessTypeView {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    buildCost: toAmount(row.build_cost),
    allowedZones: row.allowed_zones ?? [],
    outputResource: row.output_resource,
    outputPerHour: toAmount(row.output_per_hour),
    inputResource: row.input_resource,
    inputPerOutput: toAmount(row.input_per_output),
    workYield: toAmount(row.work_yield),
    sellsGoods: row.sells_goods,
    offlineBonusHours: row.offline_bonus_hours,
  };
}

export async function getInventory(): Promise<Map<string, number>> {
  const supabase = await tryCreateClient();
  if (!supabase) return new Map();

  const { data } = await supabase.from("player_inventory").select("*");
  return new Map(
    ((data ?? []) as InventoryRow[]).map((row) => [row.resource_key, toAmount(row.quantity)]),
  );
}

/** The signed-in player's businesses, with pending output already folded in. */
export async function getMyBuildings(workCooldownSeconds = 60): Promise<BuildingView[]> {
  const supabase = await tryCreateClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [buildingsResult, typesResult, plotsResult, pendingResult] = await Promise.all([
    supabase.from("buildings").select("*").eq("owner_id", user.id).order("created_at"),
    supabase.from("business_types").select("*"),
    supabase.from("plots").select("*").eq("owner_id", user.id),
    supabase.rpc("my_pending_production"),
  ]);

  const types = new Map(
    ((typesResult.data ?? []) as BusinessType[]).map((t) => [t.key, toBusinessTypeView(t)]),
  );
  const plots = new Map(((plotsResult.data ?? []) as Plot[]).map((p) => [p.id, p]));
  const pending = new Map(
    ((pendingResult.data ?? []) as PendingProduction[]).map((p) => [
      p.building_id,
      Number(p.pending) || 0,
    ]),
  );

  const now = Date.now();

  return ((buildingsResult.data ?? []) as Building[]).flatMap((row) => {
    const type = types.get(row.business_type);
    if (!type) return [];

    const lastWorked = row.last_worked_at ? Date.parse(row.last_worked_at) : null;
    const elapsed = lastWorked === null ? Infinity : (now - lastWorked) / 1000;

    return [
      {
        id: row.id,
        plotId: row.plot_id,
        businessType: row.business_type,
        level: row.level,
        workers: row.workers,
        maxWorkers: row.level * 2,
        investedValue: toAmount(row.invested_value),
        lastCollectedAt: row.last_collected_at,
        lastWorkedAt: row.last_worked_at,
        workCooldownRemaining: Math.max(0, Math.ceil(workCooldownSeconds - elapsed)),
        type,
        plot: plots.get(row.plot_id) ?? null,
        pending: pending.get(row.id) ?? 0,
      },
    ];
  });
}

/** Every building in the world, for rendering on the map. */
export async function getWorldBuildings(): Promise<
  Array<{ plotId: string; businessType: string; level: number }>
> {
  const supabase = await tryCreateClient();
  if (!supabase) return [];

  const { data } = await supabase.from("buildings").select("plot_id, business_type, level");
  return ((data ?? []) as Pick<Building, "plot_id" | "business_type" | "level">[]).map(
    (row) => ({ plotId: row.plot_id, businessType: row.business_type, level: row.level }),
  );
}
