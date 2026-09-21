import { describe, expect, it } from "vitest";
import { buildWorldData, cellNoise, cellToWorld, mix, shade } from "@/game/world/grid";
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
  it("maps cells to world units", () => {
    expect(cellToWorld(3, 20)).toBe(60);
    expect(cellToWorld(-2, 20)).toBe(-40);
    expect(cellToWorld(0, 20)).toBe(0);
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

  it("keeps plot order stable, so an instance index maps back to a plot", () => {
    // The map identifies a clicked plot by its InstancedMesh index, so the
    // order of `plots` must match the order the rows came in.
    const rows = [
      plot({ grid_x: -1, grid_z: -1 }),
      plot({ grid_x: 0, grid_z: 0, owner_id: "me" }),
      plot({ grid_x: 1, grid_z: 1 }),
    ];
    const data = buildWorldData(rows, OPTIONS);

    expect(data.plots.map((p) => p.id)).toEqual(rows.map((r) => r.id));
  });
});

describe("colour shading", () => {
  it("darkens towards black and lightens towards white", () => {
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", 0)).toBe("#808080");
  });

  it("clamps amounts beyond the range instead of producing bad hex", () => {
    expect(shade("#6366f1", -5)).toBe("#000000");
    expect(shade("#6366f1", 5)).toBe("#ffffff");
  });

  it("always returns a well-formed six-digit hex colour", () => {
    for (const amount of [-0.9, -0.55, -0.12, 0.35, 0.8]) {
      expect(shade("#0ea5e9", amount)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("colour mixing", () => {
  it("returns each end of the range exactly", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("blends towards the second colour", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps out-of-range amounts", () => {
    expect(mix("#000000", "#ffffff", -3)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 4)).toBe("#ffffff");
  });

  it("always returns a well-formed six-digit hex colour", () => {
    for (const t of [0.2, 0.45, 0.78]) {
      expect(mix("#84b562", "#a855f7", t)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
