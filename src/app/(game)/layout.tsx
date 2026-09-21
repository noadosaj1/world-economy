import { redirect } from "next/navigation";
import { TopBar } from "@/components/shell/TopBar";
import { SideNav } from "@/components/shell/SideNav";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentPlayer } from "@/services/player/state";

/**
 * Rendered per request: every one of these pages reads the signed-in
 * player's own state, so there is nothing to prerender.
 */
export const dynamic = "force-dynamic";

/**
 * Shell for every in-game route. Loads the player once and guards the two
 * states that must not reach a game page: no session, and no company yet.
 */
export default async function GameLayout({ children }: { children: React.ReactNode }) {
  // A fresh clone with no credentials should explain itself, not 500.
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6">
        <SetupNotice />
      </main>
    );
  }

  const player = await getCurrentPlayer();

  if (!player) redirect("/login");
  if (!player.isOnboarded) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar player={player} />
      <div className="flex flex-1 flex-col md:flex-row">
        <SideNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
