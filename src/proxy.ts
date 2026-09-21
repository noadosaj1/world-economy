import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session on every navigation and keeps unauthenticated
 * players out of the game routes.
 *
 * This is the only place that can reliably write refreshed auth cookies, since
 * Server Components are not allowed to set them.
 */

/** Routes that require a signed-in player. */
const PROTECTED_PREFIXES = ["/dashboard", "/world", "/company", "/onboarding"];

/** Routes a signed-in player has no reason to see. */
const AUTH_PREFIXES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  // Without configuration there is no session to refresh; let the page render
  // its own "not configured" guidance instead of crashing here.
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (not getSession()) revalidates the token with Supabase, so a
  // tampered cookie cannot fake a signed-in player.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|hdr)$).*)",
  ],
};
