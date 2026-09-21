import { describe, expect, it } from "vitest";
import {
  buildWorldData,
  cellNoise,
  cellToWorld,
  plotAt,
  worldToCell,
} from "@/game/world/grid";
import type { Plot } from "@/types/db";

function plot(overrides: Partial<Plot> & Pick<Plot, "grid_x" | "grid_z">): Plot {
  return {
    id: `${overrides.grid_x}:${overrides.grid_z}`,
    zone: "rural",
    size: 1,
    purchase_price: "8000.00",
    building_capacity: 1,
    owner_id: null,
    is_purchasable: true,
    is_starter_eligible: true,
    acquired_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Plot;
}

const OPTIONS = {
  gridMin: -1,
  gridMax: 1,
  cellSize: 20,
  myId: "me",
  ownerLabels: new Map([["me", "Noa Industries"]]),
};

describe("grid maths", () => {
  it("maps cells to world units and back", () => {
    expect(cellToWorld(3, 20)).toBe(60);
    expect(worldToCell(60, 20)).toBe(3);
    expect(worldToCell(-41, 20)).toBe(-2);
  });

  it("snaps positions inside a cell to that cell", () => {
    expect(worldToCell(58, 20)).toBe(3);
    expect(worldToCell(69, 20)).toBe(3);
  });

  it("produces stable noise for a cell", () => {
    expect(cellNoise(4, 7)).toBe(cellNoise(4, 7));
    expect(cellNoise(4, 7)).not.toBe(cellNoise(7, 4));
    for (const [x, z] of [[0, 0], [5, -3], [-12, 12]] as const) {
      const n = cellNoise(x, z);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("world data", () => {
  it("treats every gap in the grid as road", () => {
    // A 3x3 grid with a single plot at the centre leaves 8 road cells.
    const data = buildWorldData([plot({ grid_x: 0, grid_z: 0 })], OPTIONS);
    expect(data.plots).toHaveLength(1);
    expect(data.roadCells).toHaveLength(8);
    expect(data.roadCells).not.toContainEqual([0, 0]);
  });

  it("marks the signed-in player's own land", () => {
    const data = buildWorldData(
      [
        plot({ grid_x: 0, grid_z: 0, owner_id: "me" }),
        plot({ grid_x: 1, grid_z: 0, owner_id: "someone-else" }),
        plot({ grid_x: -1, grid_z: 0 }),
      ],
      OPTIONS,
    );

    expect(data.plots.find((p) => p.gridX === 0)?.isMine).toBe(true);
    expect(data.plots.find((p) => p.gridX === 1)?.isMine).toBe(false);
    expect(data.plots.find((p) => p.gridX === -1)?.isMine).toBe(false);
  });

  it("labels owned plots from public company data only", () => {
    const data = buildWorldData(
      [
        plot({ grid_x: 0, grid_z: 0, owner_id: "me" }),
        // An owner with no company row must not invent a label.
        plot({ grid_x: 1, grid_z: 1, owner_id: "ghost" }),
        plot({ grid_x: -1, grid_z: -1 }),
      ],
      OPTIONS,
    );

    expect(data.plots.find((p) => p.gridX === 0)?.ownerLabel).toBe("Noa Industries");
    expect(data.plots.find((p) => p.gridX === 1)?.ownerLabel).toBeNull();
    expect(data.plots.find((p) => p.gridX === -1)?.ownerLabel).toBeNull();
  });

  it("parses prices out of numeric strings", () => {
    const data = buildWorldData(
      [plot({ grid_x: 0, grid_z: 0, purchase_price: "120000.00" })],
      OPTIONS,
    );
    expect(data.plots[0]!.price).toBe(120000);
  });

  it("finds the plot under a world position", () => {
    const data = buildWorldData(
      [plot({ grid_x: 2, grid_z: -1, owner_id: "me" })],
      { ...OPTIONS, gridMin: -3, gridMax: 3 },
    );

    expect(plotAt(data, 40, -20)?.gridX).toBe(2);
    // Standing on the road between plots is not standing on a plot.
    expect(plotAt(data, 0, 0)).toBeNull();
  });
});
