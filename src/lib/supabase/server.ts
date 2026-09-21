import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, requirePublicEnv } from "./env";

/**
 * Server Supabase client bound to the request's cookies.
 *
 * Runs as the logged-in player, so RLS still applies - this is the client used
 * for reads and for calling the game's RPCs on the player's behalf.
 */
export async function createClient() {
  // Read cookies first: this is what marks the route as dynamic. Doing it
  // before the env check means a misconfigured project reports a clear error
  // at request time instead of failing a static prerender.
  const cookieStore = await cookies();
  const { url, anonKey } = requirePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Session refresh happens in
          // src/proxy.ts and in Server Actions, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Same client, but null instead of throwing when the project has no Supabase
 * credentials. Data-loading code uses this so an unconfigured clone renders
 * setup instructions rather than an error page.
 */
export async function tryCreateClient() {
  if (!isSupabaseConfigured()) return null;
  return createClient();
}
