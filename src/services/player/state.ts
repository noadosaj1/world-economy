import { tryCreateClient } from "@/lib/supabase/server";
import { ECONOMY, WORLD } from "@/config/economy";
import type { Company, GameConfigRow, Plot, PlayerTransaction, Profile } from "@/types/db";

/**
 * Reads the signed-in player's world state.
 *
 * Everything here goes through the player's own RLS-scoped client, so this
 * module physically cannot read another player's private data.
 */

export type PlayerState = {
  profile: Profile;
  company: Company | null;
  plots: Plot[];
  netWorth: number;
  isOnboarded: boolean;
};

export type GameSettings = {
  startingCash: number;
  starterPlotCount: number;
  offlineCapHours: number;
  worldGridMin: number;
  worldGridMax: number;
  worldCellSize: number;
};

/** Config from the database, falling back to the documented defaults. */
export async function getGameSettings(): Promise<GameSettings> {
  const supabase = await tryCreateClient();
  const { data } = supabase
    ? await supabase.from("game_config").select("key, value")
    : { data: null };

  const rows = (data ?? []) as Pick<GameConfigRow, "key" | "value">[];
  const map = new Map(rows.map((r) => [r.key, Number.parseFloat(r.value)]));
  const read = (key: string, fallback: number) => {
    const v = map.get(key);
    return v !== undefined && Number.isFinite(v) ? v : fallback;
  };

  return {
    startingCash: read("starting_cash", ECONOMY.startingCash),
    starterPlotCount: read("starter_plot_count", ECONOMY.starterPlotCount),
    offlineCapHours: read("offline_cap_hours", ECONOMY.offlineCapHours),
    worldGridMin: read("world_grid_min", WORLD.gridMin),
    worldGridMax: read("world_grid_max", WORLD.gridMax),
    worldCellSize: read("world_cell_size", WORLD.cellSize),
  };
}

/** The signed-in player, or null when there is no session. */
export async function getCurrentPlayer(): Promise<PlayerState | null> {
  const supabase = await tryCreateClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, companyResult, plotsResult, netWorthResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("companies").select("*").eq("owner_id", user.id).maybeSingle(),
    supabase.from("plots").select("*").eq("owner_id", user.id).order("created_at"),
    supabase.rpc("my_net_worth"),
  ]);

  const profile = profileResult.data as Profile | null;
  if (!profile) return null;

  return {
    profile,
    company: (companyResult.data as Company | null) ?? null,
    plots: (plotsResult.data as Plot[] | null) ?? [],
    netWorth: Number.parseFloat(String(netWorthResult.data ?? "0")) || 0,
    isOnboarded: profile.onboarded_at !== null,
  };
}

/** Every plot in the world. Public data - this is what the map renders. */
export async function getWorldPlots(): Promise<Plot[]> {
  const supabase = await tryCreateClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("plots")
    .select("*")
    .order("grid_z")
    .order("grid_x");
  return (data ?? []) as Plot[];
}

/** The player's own money ledger, newest first. */
export async function getRecentTransactions(limit = 10): Promise<PlayerTransaction[]> {
  const supabase = await tryCreateClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("player_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PlayerTransaction[];
}

/**
 * Public identity for the players who own land, for nameplates and the map.
 * Deliberately sourced from `companies` (public) rather than `profiles`
 * (private), so no wallet data is ever exposed.
 */
export type PublicOwner = { ownerId: string; companyName: string; ticker: string };

export async function getPlotOwners(): Promise<Map<string, PublicOwner>> {
  const supabase = await tryCreateClient();
  if (!supabase) return new Map();

  const { data } = await supabase.from("companies").select("owner_id, name, ticker");
  const rows = (data ?? []) as Pick<Company, "owner_id" | "name" | "ticker">[];
  return new Map(
    rows.map((r) => [r.owner_id, { ownerId: r.owner_id, companyName: r.name, ticker: r.ticker }]),
  );
}
