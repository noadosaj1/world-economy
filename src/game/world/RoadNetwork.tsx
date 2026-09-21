"use client";

import { useMemo } from "react";
import { cellToWorld, cellKey, type WorldData } from "./grid";
import { InstancedTiles, type TileInstance } from "./InstancedTiles";

/**
 * Roads and their markings.
 *
 * A road exists wherever the plot grid has a gap, so the street layout is
 * derived from the database rather than described twice. Centre lines are only
 * drawn along a road that continues in that direction, which is what stops
 * markings from running through junctions.
 */

const ASPHALT = "#3f4653";
const MARKING = "#d8dde8";
const PAVEMENT = "#8d9099";

export function RoadNetwork({ data }: { data: WorldData }) {
  const { cellSize } = data;

  const { surface, markings, kerbs } = useMemo(() => {
    const roadSet = new Set(data.roadCells.map(([x, z]) => cellKey(x, z)));
    const isRoad = (x: number, z: number) => roadSet.has(cellKey(x, z));

    const surface: TileInstance[] = [];
    const markings: TileInstance[] = [];

    for (const [x, z] of data.roadCells) {
      const wx = cellToWorld(x, cellSize);
      const wz = cellToWorld(z, cellSize);

      surface.push({
        position: [wx, 0.08, wz],
        scale: [cellSize, 0.16, cellSize],
        color: ASPHALT,
      });

      const runsNorthSouth = isRoad(x, z - 1) || isRoad(x, z + 1);
      const runsEastWest = isRoad(x - 1, z) || isRoad(x + 1, z);
      const isJunction = runsNorthSouth && runsEastWest;

      // Dashed centre line, skipped at junctions.
      if (!isJunction && runsNorthSouth) {
        for (const offset of [-0.3, 0, 0.3]) {
          markings.push({
            position: [wx, 0.17, wz + offset * cellSize],
            scale: [0.7, 0.02, cellSize * 0.18],
            color: MARKING,
          });
        }
      } else if (!isJunction && runsEastWest) {
        for (const offset of [-0.3, 0, 0.3]) {
          markings.push({
            position: [wx + offset * cellSize, 0.17, wz],
            scale: [cellSize * 0.18, 0.02, 0.7],
            color: MARKING,
          });
        }
      }
    }

    // A pavement lip around every plot, which is what makes streets read.
    const kerbs: TileInstance[] = data.plots.map((plot) => ({
      position: [cellToWorld(plot.gridX, cellSize), 0.16, cellToWorld(plot.gridZ, cellSize)],
      scale: [cellSize * 0.98, 0.32, cellSize * 0.98],
      color: PAVEMENT,
    }));

    return { surface, markings, kerbs };
  }, [data.roadCells, data.plots, cellSize]);

  return (
    <group>
      <InstancedTiles instances={surface} roughness={0.95} />
      <InstancedTiles instances={kerbs} roughness={0.9} />
      <InstancedTiles instances={markings} roughness={0.6} receiveShadow={false} />
    </group>
  );
}
