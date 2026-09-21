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
import { getWorldBuildings } from "@/services/economy/read";

export const metadata: Metadata = { title: "World" };

/**
 * The 3D world route.
 *
 * All world state is fetched server-side from the database and handed to the
 * canvas as plain data. The client renders it; it never invents it.
 */
export default async function WorldPage() {
  const [player, plots, settings, owners, worldBuildings] = await Promise.all([
    getCurrentPlayer(),
    getWorldPlots(),
    getGameSettings(),
    getPlotOwners(),
    getWorldBuildings(),
  ]);

  if (!player) redirect("/login");

  const ownerLabels = new Map(
    [...owners.values()].map((owner) => [owner.ownerId, owner.companyName]),
  );

  const businesses = new Map(
    worldBuildings.map((b) => [b.plotId, { type: b.businessType, level: b.level }]),
  );

  const data = buildWorldData(plots, {
    gridMin: settings.worldGridMin,
    gridMax: settings.worldGridMax,
    cellSize: settings.worldCellSize,
    myId: player.profile.id,
    ownerLabels,
    businesses,
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
