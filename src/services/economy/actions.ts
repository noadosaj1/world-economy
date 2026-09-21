"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toGameFailure } from "@/lib/errors";
import { formatMoney } from "@/lib/economy/format";
import type { CollectResult, WorkResult } from "@/types/db";
import type { ActionResult } from "./form-state";

/**
 * Every economy action.
 *
 * Each one is a thin wrapper: it reads the form, calls the matching database
 * function, and turns the result into a sentence. All validation, locking,
 * pricing and auditing happens in Postgres - nothing here decides an outcome.
 */

/** Refresh every route that shows money, goods or ownership. */
function revalidateGame() {
  revalidatePath("/", "layout");
}

async function callRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  return { data, error: error ? toGameFailure(error).message : null };
}

/** Reads a uuid out of form data, refusing anything that is not one. */
function readId(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (typeof value !== "string") return null;
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function buyPlotAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const plotId = readId(formData, "plotId");
  if (!plotId) return { error: "That plot isn't valid.", success: null };

  const { error } = await callRpc("buy_plot", { p_plot_id: plotId });
  if (error) return { error, success: null };

  revalidateGame();
  return { error: null, success: "Land bought. Build something on it." };
}

export async function buildBusinessAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const plotId = readId(formData, "plotId");
  const businessType = formData.get("businessType");

  if (!plotId) return { error: "That plot isn't valid.", success: null };
  if (typeof businessType !== "string" || !/^[a-z_]{2,24}$/.test(businessType)) {
    return { error: "That isn't a business you can build.", success: null };
  }

  const { error } = await callRpc("build_business", {
    p_plot_id: plotId,
    p_business_type: businessType,
  });
  if (error) return { error, success: null };

  revalidateGame();
  return { error: null, success: "Built. Go and work it." };
}

export async function workBusinessAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = readId(formData, "buildingId");
  if (!buildingId) return { error: "That business isn't valid.", success: null };

  const { data, error } = await callRpc("work_business", { p_building_id: buildingId });
  if (error) return { error, success: null };

  const result = data as WorkResult | null;
  revalidateGame();

  if (!result) return { error: null, success: "Shift worked." };

  const tip = Number(result.tip) || 0;
  return {
    error: null,
    success:
      `+${result.quantity} ${result.resource}` +
      (tip > 0 ? `  ·  +${formatMoney(tip)}` : ""),
  };
}

export async function collectAllAction(
  _prev: ActionResult,
  _formData?: FormData,
): Promise<ActionResult> {
  const { data, error } = await callRpc("collect_all", {});
  if (error) return { error, success: null };

  const result = data as CollectResult | null;
  revalidateGame();

  const goods = Object.entries(result?.goods ?? {}).filter(([, qty]) => Number(qty) > 0);
  const earned = Number(result?.earned) || 0;

  if (goods.length === 0 && earned === 0) {
    return { error: null, success: "Nothing to collect yet." };
  }

  const parts = goods.map(([resource, qty]) => `+${qty} ${resource}`);
  if (earned > 0) parts.push(`+${formatMoney(earned)}`);

  return { error: null, success: parts.join("  ·  ") };
}

export async function upgradeBusinessAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = readId(formData, "buildingId");
  if (!buildingId) return { error: "That business isn't valid.", success: null };

  const { data, error } = await callRpc("upgrade_business", { p_building_id: buildingId });
  if (error) return { error, success: null };

  const level = (data as { level?: number } | null)?.level;
  revalidateGame();
  return { error: null, success: level ? `Upgraded to level ${level}.` : "Upgraded." };
}

export async function hireWorkerAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const buildingId = readId(formData, "buildingId");
  if (!buildingId) return { error: "That business isn't valid.", success: null };

  const { data, error } = await callRpc("hire_worker", { p_building_id: buildingId });
  if (error) return { error, success: null };

  const workers = (data as { workers?: number } | null)?.workers;
  revalidateGame();
  return {
    error: null,
    success: workers ? `Hired. ${workers} on the payroll here.` : "Worker hired.",
  };
}

/** Reads a whole-number quantity, refusing fractions and absurd values. */
function readQuantity(formData: FormData): number | null {
  const raw = formData.get("quantity");
  const value = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) return null;
  return value;
}

export async function sellResourceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const resource = formData.get("resource");
  const quantity = readQuantity(formData);

  if (typeof resource !== "string" || !/^[a-z_]{2,24}$/.test(resource)) {
    return { error: "That isn't something you can trade.", success: null };
  }
  if (quantity === null) return { error: "Enter a whole number to sell.", success: null };

  const { data, error } = await callRpc("sell_resource", {
    p_resource: resource,
    p_quantity: quantity,
  });
  if (error) return { error, success: null };

  const gross = Number((data as { gross?: number } | null)?.gross) || 0;
  revalidateGame();
  return { error: null, success: `Sold ${quantity} for ${formatMoney(gross)}.` };
}

export async function buyResourceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const resource = formData.get("resource");
  const quantity = readQuantity(formData);

  if (typeof resource !== "string" || !/^[a-z_]{2,24}$/.test(resource)) {
    return { error: "That isn't something you can trade.", success: null };
  }
  if (quantity === null) return { error: "Enter a whole number to buy.", success: null };

  const { data, error } = await callRpc("buy_resource", {
    p_resource: resource,
    p_quantity: quantity,
  });
  if (error) return { error, success: null };

  const cost = Number((data as { cost?: number } | null)?.cost) || 0;
  revalidateGame();
  return { error: null, success: `Bought ${quantity} for ${formatMoney(cost)}.` };
}
