"use client";

import { useMemo } from "react";
import type { ZoneKey } from "@/config/economy";
import { cellNoise, cellToWorld, shade, type WorldData, type WorldPlot } from "./grid";
import { InstancedTiles, type TileInstance } from "./InstancedTiles";

/**
 * What stands on each plot.
 *
 * Buildings are assembled from a base block, an upper setback and a coloured
 * roof, with per-zone palettes and heights, so a district is recognisable from
 * above: towers downtown, long low sheds in industrial, barns and trees in
 * rural. Every piece is instanced, so the whole city is six draw calls.
 *
 * Shape and height are derived from the plot's grid coordinates, never from
 * random(), so a building never changes or flickers between frames.
 *
 * Unclaimed plots get generic city fabric. A *claimed* plot is marked by its
 * label and pad colour rather than by a building, because Phase 1 has no
 * businesses yet - inventing one here would show a company that does not
 * exist.
 */

type ZoneStyle = {
  maxFloors: number;
  minFloors: number;
  footprint: number;
  roofs: string[];
  walls: string[];
  /** Chance a plot is left as open ground, 0-1. */
  emptiness: number;
  trees: boolean;
};

const STYLES: Record<ZoneKey, ZoneStyle> = {
  downtown: {
    maxFloors: 14, minFloors: 5, footprint: 0.72,
    roofs: ["#2f3446", "#39405c", "#4a5170"],
    walls: ["#8e9bbf", "#7d8ab0", "#9aa6c7", "#6f7da6"],
    emptiness: 0.04, trees: false,
  },
  commercial: {
    maxFloors: 7, minFloors: 2, footprint: 0.68,
    roofs: ["#2d6a7a", "#37788a", "#255a68"],
    walls: ["#d8cdb4", "#e4dcc6", "#c9bda2", "#eae3d0"],
    emptiness: 0.1, trees: false,
  },
  industrial: {
    maxFloors: 3, minFloors: 1, footprint: 0.84,
    roofs: ["#6b6f77", "#7b808a", "#5c6067"],
    walls: ["#b0b4bb", "#9ba0a8", "#c2c6cc"],
    emptiness: 0.12, trees: false,
  },
  residential: {
    maxFloors: 3, minFloors: 1, footprint: 0.5,
    roofs: ["#a8443a", "#8f3a31", "#b95448", "#7d564a"],
    walls: ["#efe7d8", "#e6dcc9", "#f4eee2"],
    emptiness: 0.22, trees: true,
  },
  rural: {
    maxFloors: 2, minFloors: 1, footprint: 0.4,
    roofs: ["#8d4a3c", "#6f4a3a"],
    walls: ["#e8ddc6", "#d9cdb4"],
    emptiness: 0.55, trees: true,
  },
  mining: {
    maxFloors: 2, minFloors: 1, footprint: 0.6,
    roofs: ["#5a5650", "#6a655d"],
    walls: ["#8a8478", "#9b9488"],
    emptiness: 0.4, trees: false,
  },
  waterfront: {
    maxFloors: 3, minFloors: 1, footprint: 0.76,
    roofs: ["#2b7f96", "#246d80"],
    walls: ["#cfd8dc", "#bcc7cc"],
    emptiness: 0.18, trees: false,
  },
  entertainment: {
    maxFloors: 6, minFloors: 2, footprint: 0.7,
    roofs: ["#a8397a", "#8d2f66", "#c04a8c"],
    walls: ["#e8d4e4", "#dcc4d8", "#f0e0ec"],
    emptiness: 0.12, trees: false,
  },
  gambling: {
    maxFloors: 9, minFloors: 3, footprint: 0.74,
    roofs: ["#7b3fc4", "#6832a8", "#8f52d8"],
    walls: ["#e4d8f4", "#d4c4ec", "#f0e8fa"],
    emptiness: 0.06, trees: false,
  },
};

const FLOOR_HEIGHT = 4.2;

function pick<T>(list: T[], roll: number): T {
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))]!;
}

export function CityBlocks({ data }: { data: WorldData }) {
  const { cellSize } = data;

  const { bases, setbacks, roofs, trunks, canopies } = useMemo(() => {
    const bases: TileInstance[] = [];
    const setbacks: TileInstance[] = [];
    const roofs: TileInstance[] = [];
    const trunks: TileInstance[] = [];
    const canopies: TileInstance[] = [];

    for (const plot of data.plots) {
      const style = STYLES[plot.zone];
      const wx = cellToWorld(plot.gridX, cellSize);
      const wz = cellToWorld(plot.gridZ, cellSize);

      // A plot with a business gets that business drawn on it, sized by its
      // level, so progress is visible from the map. This is real persisted
      // state, not scenery.
      if (plot.business) {
        addPlayerBuilding(bases, setbacks, roofs, plot, wx, wz, cellSize);
        continue;
      }

      // Claimed but empty land stays clear: its label and pad colour say who
      // owns it, and there is genuinely nothing built there yet.
      if (plot.ownerId) {
        if (style.trees) addTree(trunks, canopies, plot, wx, wz, cellSize, 0.3);
        continue;
      }

      const emptyRoll = cellNoise(plot.gridX, plot.gridZ, 1);
      if (emptyRoll < style.emptiness) {
        if (style.trees) addTree(trunks, canopies, plot, wx, wz, cellSize, 0.0);
        continue;
      }

      const heightRoll = cellNoise(plot.gridX, plot.gridZ, 3);
      const floors = Math.max(
        style.minFloors,
        Math.round(style.minFloors + heightRoll * (style.maxFloors - style.minFloors)),
      );
      const height = floors * FLOOR_HEIGHT;

      const sizeRoll = cellNoise(plot.gridX, plot.gridZ, 7);
      const width = cellSize * style.footprint * (0.84 + sizeRoll * 0.3);
      const depth = cellSize * style.footprint * (0.84 + cellNoise(plot.gridX, plot.gridZ, 9) * 0.3);

      const wall = pick(style.walls, cellNoise(plot.gridX, plot.gridZ, 13));
      const roof = pick(style.roofs, cellNoise(plot.gridX, plot.gridZ, 17));

      // Nudge the building off-centre so blocks don't look stamped out.
      const jitter = cellSize * 0.06;
      const ox = wx + (cellNoise(plot.gridX, plot.gridZ, 19) - 0.5) * jitter;
      const oz = wz + (cellNoise(plot.gridX, plot.gridZ, 23) - 0.5) * jitter;

      bases.push({
        position: [ox, 0.44 + height / 2, oz],
        scale: [width, height, depth],
        color: wall,
      });

      // Taller buildings get a narrower upper section, which is what gives
      // downtown its stepped skyline.
      if (floors >= 5) {
        const upper = height * (0.3 + cellNoise(plot.gridX, plot.gridZ, 29) * 0.28);
        setbacks.push({
          position: [ox, 0.44 + height + upper / 2, oz],
          scale: [width * 0.62, upper, depth * 0.62],
          color: shade(wall, -0.12),
        });
        roofs.push({
          position: [ox, 0.44 + height + upper + 0.5, oz],
          scale: [width * 0.66, 1, depth * 0.66],
          color: roof,
        });
      } else {
        roofs.push({
          position: [ox, 0.44 + height + 0.7, oz],
          scale: [width * 1.06, 1.4, depth * 1.06],
          color: roof,
        });
      }
    }

    return { bases, setbacks, roofs, trunks, canopies };
  }, [data.plots, cellSize]);

  return (
    <group>
      <InstancedTiles instances={bases} roughness={0.75} castShadow />
      <InstancedTiles instances={setbacks} roughness={0.75} castShadow />
      <InstancedTiles instances={roofs} roughness={0.6} castShadow />
      <InstancedTiles instances={trunks} roughness={0.9} />
      <InstancedTiles instances={canopies} roughness={0.85} castShadow />
    </group>
  );
}

/**
 * Per-business look. A player can tell a farm from a foundry at a glance, and
 * a level 5 anything towers over a level 1.
 */
type BusinessLook = {
  walls: string;
  roof: string;
  floors: number;
  footprint: number;
  /** A silo, chimney or sign that marks the trade out. */
  accent?: string;
};

const BUSINESS_LOOK: Record<string, BusinessLook> = {
  farm:      { walls: "#f0e4c8", roof: "#b04a38", floors: 1, footprint: 0.5, accent: "#8d6a3f" },
  mine:      { walls: "#8a8478", roof: "#4a463f", floors: 1, footprint: 0.58, accent: "#5d5850" },
  mill:      { walls: "#eadfc4", roof: "#c08a3e", floors: 2, footprint: 0.62 },
  foundry:   { walls: "#9aa0a8", roof: "#4b5158", floors: 2, footprint: 0.7,  accent: "#d4622a" },
  store:     { walls: "#e8f0f6", roof: "#2f7fa8", floors: 1, footprint: 0.6,  accent: "#3aa0d0" },
  warehouse: { walls: "#c9ccd2", roof: "#6a6f78", floors: 1, footprint: 0.78 },
};

const FALLBACK_LOOK: BusinessLook = {
  walls: "#d8d8d8",
  roof: "#5a5a5a",
  floors: 1,
  footprint: 0.6,
};

function addPlayerBuilding(
  bases: TileInstance[],
  setbacks: TileInstance[],
  roofs: TileInstance[],
  plot: WorldPlot,
  wx: number,
  wz: number,
  cellSize: number,
) {
  const business = plot.business!;
  const look = BUSINESS_LOOK[business.type] ?? FALLBACK_LOOK;

  // Each level adds a floor, so upgrading is visible from across the map.
  const floors = look.floors + (business.level - 1);
  const height = floors * FLOOR_HEIGHT;
  const width = cellSize * look.footprint;

  bases.push({
    position: [wx, 0.44 + height / 2, wz],
    scale: [width, height, width],
    color: look.walls,
  });

  roofs.push({
    position: [wx, 0.44 + height + 0.8, wz],
    scale: [width * 1.1, 1.6, width * 1.1],
    color: look.roof,
  });

  // A silo, chimney or sign - whatever marks the trade out.
  if (look.accent) {
    setbacks.push({
      position: [wx + width * 0.62, 0.44 + height * 0.7, wz - width * 0.42],
      scale: [width * 0.24, height * 1.4, width * 0.24],
      color: look.accent,
    });
  }

  // Levels 4 and 5 gain an upper block, so the top of the range reads as big.
  if (business.level >= 4) {
    setbacks.push({
      position: [wx, 0.44 + height + 2.4, wz],
      scale: [width * 0.6, FLOOR_HEIGHT, width * 0.6],
      color: shade(look.walls, -0.15),
    });
  }
}

/** Two boxes make a readable stylised tree from a map camera. */
function addTree(
  trunks: TileInstance[],
  canopies: TileInstance[],
  plot: WorldPlot,
  wx: number,
  wz: number,
  cellSize: number,
  offset: number,
) {
  const count = 1 + Math.floor(cellNoise(plot.gridX, plot.gridZ, 31) * 3);

  for (let i = 0; i < count; i += 1) {
    const ax = (cellNoise(plot.gridX, plot.gridZ, 37 + i * 5) - 0.5) * cellSize * 0.62;
    const az = (cellNoise(plot.gridX, plot.gridZ, 41 + i * 5) - 0.5) * cellSize * 0.62;
    const scale = 0.8 + cellNoise(plot.gridX, plot.gridZ, 43 + i * 5) * 0.5;

    trunks.push({
      position: [wx + ax + offset, 0.44 + 1.4 * scale, wz + az],
      scale: [0.7, 2.8 * scale, 0.7],
      color: "#6b4a30",
    });
    canopies.push({
      position: [wx + ax + offset, 0.44 + 3.6 * scale, wz + az],
      scale: [3.4 * scale, 3.4 * scale, 3.4 * scale],
      color: cellNoise(plot.gridX, plot.gridZ, 47 + i) > 0.5 ? "#3f7a34" : "#4d8c3e",
    });
  }
}
