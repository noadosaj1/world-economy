/**
 * Result shape for every economy action.
 *
 * Kept out of actions.ts because a `"use server"` module may only export
 * async functions; a plain object export throws at request time.
 */

export type ActionResult = {
  error: string | null;
  /** A short confirmation, e.g. "+10 Wheat  ·  +$4". */
  success: string | null;
};

export const emptyActionResult: ActionResult = { error: null, success: null };
