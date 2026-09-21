"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "./env";

/**
 * Browser Supabase client. Carries the player's session and is therefore
 * subject to Row Level Security: it can read what the player is allowed to
 * read and cannot write anything economic.
 */
export function createClient() {
  const { url, anonKey } = requirePublicEnv();
  return createBrowserClient(url, anonKey);
}
