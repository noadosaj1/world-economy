"use client";

import { useMemo } from "react";
import { ZONES } from "@/config/economy";
import { cellNoise, cellToWorld, worldExtent, type WorldData } from "./grid";
import { InstancedTiles, type TileInstance } from "./InstancedTiles";

/**
 * The static world: ground, roads, plot pads and city scenery.
 *
 * Everything positional comes from `WorldData`, which comes from the `plots`
 * table. The only invented geometry is the background city scenery on
 * unclaimed commercial land - it is deliberately plain, and no scenery block
 * is ever drawn on a plot a player owns, so a building in the world is never
 * mistaken for a business that does not exist.
 */

const ROAD_COLOR = "#232a44";
const SIDEWALK_COLOR = "#39416a";
const GROUND_COLOR = "#121834";

export function WorldScene({ data }: { data: WorldData }) {
  const { cellSize } = data;
  const extent = worldExtent(data);

  const plotTiles = useMemo<TileInstance[]>(
    () =>
      data.plots.map((plot) => {
        const zone = ZONES[plot.zone];
        // Owned land is pushed a touch brighter and taller so it reads as
        // claimed from across the map.
        const height = plot.ownerId ? 1.1 : 0.55;
        return {
          position: [
            cellToWorld(plot.gridX, cellSize),
            height / 2,
            cellToWorld(plot.gridZ, cellSize),
          ],
          scale: [cellSize * 0.86, height, cellSize * 0.86],
          color: plot.isMine ? "#d9f99d" : plot.ownerId ? zone.color : shade(zone.color, -0.35),
        };
      }),
    [data.plots, cellSize],
  );

  const roadTiles = useMemo<TileInstance[]>(
    () =>
      data.roadCells.map(([x, z]) => ({
        position: [cellToWorld(x, cellSize), 0.12, cellToWorld(z, cellSize)],
        scale: [cellSize, 0.24, cellSize],
        color: ROAD_COLOR,
      })),
    [data.roadCells, cellSize],
  );

  // A thin kerb around each plot, which is what makes the streets readable.
  const kerbTiles = useMemo<TileInstance[]>(
    () =>
      data.plots.map((plot) => ({
        position: [cellToWorld(plot.gridX, cellSize), 0.22, cellToWorld(plot.gridZ, cellSize)],
        scale: [cellSize * 0.96, 0.44, cellSize * 0.96],
        color: SIDEWALK_COLOR,
      })),
    [data.plots, cellSize],
  );

  /**
   * Background city. Only unclaimed, non-purchasable or dense-zone plots get a
   * block, and never a plot with an owner.
   */
  const scenery = useMemo<TileInstance[]>(() => {
    const tiles: TileInstance[] = [];

    for (const plot of data.plots) {
      if (plot.ownerId) continue;

      const dense =
        plot.zone === "downtown" ||
        plot.zone === "commercial" ||
        plot.zone === "gambling" ||
        plot.zone === "entertainment";
      if (!dense && plot.isPurchasable) continue;

      const roll = cellNoise(plot.gridX, plot.gridZ);
      if (plot.isPurchasable && roll > 0.62) continue;

      const zone = ZONES[plot.zone];
      const maxHeight =
        plot.zone === "downtown" ? 46 : plot.zone === "gambling" ? 30 : plot.zone === "commercial" ? 22 : 16;
      const height = 6 + cellNoise(plot.gridX, plot.gridZ, 3) * maxHeight;
      const footprint = cellSize * (0.44 + cellNoise(plot.gridX, plot.gridZ, 7) * 0.26);

      tiles.push({
        position: [
          cellToWorld(plot.gridX, cellSize),
          height / 2 + 0.4,
          cellToWorld(plot.gridZ, cellSize),
        ],
        scale: [footprint, height, footprint],
        color: shade(zone.color, -0.55 + cellNoise(plot.gridX, plot.gridZ, 11) * 0.25),
      });
    }

    return tiles;
  }, [data.plots, cellSize]);

  return (
    <group>
      {/* Ground, extended past the grid so the world has no visible edge. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[extent * 3, extent * 3]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>

      <InstancedTiles instances={roadTiles} roughness={0.95} />
      <InstancedTiles instances={kerbTiles} roughness={0.9} />
      <InstancedTiles instances={plotTiles} roughness={0.7} />
      <InstancedTiles instances={scenery} roughness={0.6} castShadow />
    </group>
  );
}

/** Lightens (positive) or darkens (negative) a hex colour. */
function shade(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const num = Number.parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const mix = (channel: number) => {
    const target = amount < 0 ? 0 : 255;
    const t = Math.abs(amount);
    return Math.round(channel + (target - channel) * t);
  };

  return `#${[mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}
