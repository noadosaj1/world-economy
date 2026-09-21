/**
 * Game error codes and their human-readable messages.
 *
 * Server logic raises stable codes (see game_error() in the migrations). The
 * player should never see a Postgres error string, so everything funnels
 * through here.
 */

export const GAME_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "You need to sign in first.",
  PLAYER_NOT_FOUND: "We couldn't find your player profile.",
  ALREADY_ONBOARDED: "You already have a company.",
  INSUFFICIENT_FUNDS: "Not enough money.",
  INVALID_AMOUNT: "That amount isn't valid.",
  INVALID_QUANTITY: "That quantity isn't valid.",
  INVALID_USERNAME: "Usernames are 3-20 letters, numbers or underscores.",
  INVALID_COMPANY_NAME: "Company names are 3-40 characters, with no symbols like < or >.",
  INVALID_TICKER: "Tickers are 2-5 letters, like NOA.",
  USERNAME_TAKEN: "That username is taken.",
  COMPANY_NAME_TAKEN: "A company already trades under that name.",
  TICKER_TAKEN: "That ticker is taken.",
  NAME_TAKEN: "Someone just took that name. Try another.",
  NO_STARTER_LAND_AVAILABLE: "The world is out of starter land right now.",
  NOT_OWNER: "You don't own that.",
  PLOT_NOT_FOUND: "We couldn't find that plot.",
  PLOT_OCCUPIED: "There's already a building on that plot.",
  PLOT_NOT_FOR_SALE: "That plot isn't for sale.",
  PLOT_ALREADY_OWNED: "Someone already owns that plot.",
  BUILDING_NOT_FOUND: "We couldn't find that business.",
  UNKNOWN_BUSINESS_TYPE: "That isn't a business you can build.",
  WRONG_ZONE: "That business can't be built in this district.",
  MAX_LEVEL_REACHED: "This business is already at the highest level.",
  NO_WORKER_SLOTS: "No room for another worker. Upgrade to add slots.",
  CANNOT_BE_WORKED: "There's nothing to do by hand at this business.",
  ON_COOLDOWN: "You've just worked here. Give it a moment.",
  MISSING_INPUT: "You don't have the goods this business needs.",
  NOT_ENOUGH_GOODS: "You don't have that many.",
  UNKNOWN_RESOURCE: "That isn't something you can trade.",
  BUSINESS_LEVEL_TOO_LOW: "Your business needs to be a higher level first.",
  INVALID_TRANSACTION: "That transaction couldn't be completed.",
  RATE_LIMITED: "Slow down a moment, then try again.",
};

const FALLBACK = "Something went wrong. Please try again.";

/** True when the string looks like one of our deliberate game error codes. */
function isGameErrorCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(value);
}

export type GameFailure = { code: string; message: string };

/**
 * Turns anything thrown by Supabase or Postgres into a `{ code, message }`
 * pair that is safe to show a player. Unrecognised errors become a generic
 * message so internal details never leak into the UI.
 */
export function toGameFailure(error: unknown): GameFailure {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message ?? "")
        : "";

  const code = raw.trim();

  if (code && isGameErrorCode(code)) {
    return { code, message: GAME_ERROR_MESSAGES[code] ?? FALLBACK };
  }

  return { code: "UNKNOWN", message: FALLBACK };
}

export function gameErrorMessage(code: string): string {
  return GAME_ERROR_MESSAGES[code] ?? FALLBACK;
}
