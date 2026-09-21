import type { Plot } from "@/types/db";
import type { ZoneKey } from "@/config/economy";

/**
 * The world grid.
 *
 * A cell is either a plot (a row in the `plots` table) or a gap - and every
 * gap is drawn as road. That keeps the layout's single source of truth in the
 * database: the renderer never decides where anything is.
 */

export type WorldPlot = {
  id: string;
  gridX: number;
  gridZ: number;
  zone: ZoneKey;
  price: number;
  buildingCapacity: number;
  ownerId: string | null;
  isPurchasable: boolean;
  /** Public company identity of the owner, when there is one. */
  ownerLabel: string | null;
  isMine: boolean;
};

export type WorldData = {
  plots: WorldPlot[];
  /** Cells with no plot: these become road. */
  roadCells: Array<[number, number]>;
  gridMin: number;
  gridMax: number;
  cellSize: number;
};

export function cellToWorld(index: number, cellSize: number): number {
  return index * cellSize;
}

export function worldToCell(position: number, cellSize: number): number {
  return Math.round(position / cellSize);
}

export function cellKey(x: number, z: number): string {
  return `${x}:${z}`;
}

/** Deterministic 0..1 noise from a cell, so scenery never flickers between frames. */
export function cellNoise(x: number, z: number, salt = 0): number {
  const n = Math.sin((x * 127.1 + z * 311.7 + salt * 74.7) * 0.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Turns the plot rows into everything the scene needs, including the road
 * cells implied by the gaps in the grid.
 */
export function buildWorldData(
  plots: Plot[],
  options: {
    gridMin: number;
    gridMax: number;
    cellSize: number;
    myId: string | null;
    ownerLabels: Map<string, string>;
  },
): WorldData {
  const { gridMin, gridMax, cellSize, myId, ownerLabels } = options;

  const worldPlots: WorldPlot[] = plots.map((plot) => ({
    id: plot.id,
    gridX: plot.grid_x,
    gridZ: plot.grid_z,
    zone: plot.zone as ZoneKey,
    price: Number.parseFloat(plot.purchase_price) || 0,
    buildingCapacity: plot.building_capacity,
    ownerId: plot.owner_id,
    isPurchasable: plot.is_purchasable,
    ownerLabel: plot.owner_id ? (ownerLabels.get(plot.owner_id) ?? null) : null,
    isMine: Boolean(myId && plot.owner_id === myId),
  }));

  const occupied = new Set(worldPlots.map((p) => cellKey(p.gridX, p.gridZ)));
  const roadCells: Array<[number, number]> = [];

  for (let x = gridMin; x <= gridMax; x += 1) {
    for (let z = gridMin; z <= gridMax; z += 1) {
      if (!occupied.has(cellKey(x, z))) roadCells.push([x, z]);
    }
  }

  return { plots: worldPlots, roadCells, gridMin, gridMax, cellSize };
}

/** Half-width of the world in world units, used to clamp the player. */
export function worldExtent(data: Pick<WorldData, "gridMax" | "cellSize">): number {
  return (data.gridMax + 0.5) * data.cellSize;
}

/** The plot the given world position stands on, if any. */
export function plotAt(
  data: WorldData,
  x: number,
  z: number,
): WorldPlot | null {
  const gx = worldToCell(x, data.cellSize);
  const gz = worldToCell(z, data.cellSize);
  return data.plots.find((p) => p.gridX === gx && p.gridZ === gz) ?? null;
}
