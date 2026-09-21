import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorldView } from "@/game/world/WorldView";
import { buildWorldData } from "@/game/world/grid";
import {
  getCurrentPlayer,
  getGameSettings,
  getPlotOwners,
  getWorldPlots,
} from "@/services/player/state";

export const metadata: Metadata = { title: "World" };

/**
 * The 3D world route.
 *
 * All world state is fetched server-side from the database and handed to the
 * canvas as plain data. The client renders it; it never invents it.
 */
export default async function WorldPage() {
  const [player, plots, settings, owners] = await Promise.all([
    getCurrentPlayer(),
    getWorldPlots(),
    getGameSettings(),
    getPlotOwners(),
  ]);

  if (!player) redirect("/login");

  const ownerLabels = new Map(
    [...owners.values()].map((owner) => [owner.ownerId, owner.companyName]),
  );

  const data = buildWorldData(plots, {
    gridMin: settings.worldGridMin,
    gridMax: settings.worldGridMax,
    cellSize: settings.worldCellSize,
    myId: player.profile.id,
    ownerLabels,
  });

  return (
    // Fills the shell below the 14-unit top bar; the canvas owns its own scroll.
    <div className="h-[calc(100dvh-3.5rem)] w-full">
      <WorldView
        data={data}
        playerName={player.profile.username}
        companyLabel={player.company ? `${player.company.ticker} · ${player.company.name}` : null}
        cash={player.profile.cash}
      />
    </div>
  );
}
