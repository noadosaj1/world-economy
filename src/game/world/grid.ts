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
  /** The business standing on this plot, if one has been built. */
  business: { type: string; level: number } | null;
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
    /** Businesses by plot id, so the map can draw what was actually built. */
    businesses?: Map<string, { type: string; level: number }>;
  },
): WorldData {
  const { gridMin, gridMax, cellSize, myId, ownerLabels, businesses } = options;

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
    business: businesses?.get(plot.id) ?? null,
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


/** Lightens (positive amount) or darkens (negative) a hex colour. */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const num = Number.parseInt(clean, 16);
  const channels = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(Math.abs(amount), 1);

  return `#${channels
    .map((c) => Math.round(c + (target - c) * t))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blends two hex colours. t=0 returns `from`, t=1 returns `to`. */
export function mix(from: string, to: string, t: number): string {
  const parse = (hex: string) => {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(from);
  const b = parse(to);
  const amount = Math.min(Math.max(t, 0), 1);

  return `#${a
    .map((channel, i) => Math.round(channel + (b[i]! - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}
