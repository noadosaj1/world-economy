import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "./env";

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * The `server-only` import above makes it a build error to pull this into a
 * client component, so the key can never reach the browser. Use it only for
 * trusted maintenance work (world seeding, admin tooling, scheduled jobs) -
 * never to serve a player request that the player's own client could make.
 */
export function createAdminClient() {
  const { url } = requirePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required for admin operations " +
        "and must never be exposed to the browser.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
