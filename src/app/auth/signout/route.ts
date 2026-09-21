import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST-only sign out, so a stray link or image can't log a player out. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
