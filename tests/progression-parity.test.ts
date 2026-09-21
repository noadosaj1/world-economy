import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROGRESSION } from "@/config/economy";

/**
 * Guards against the UI and the database disagreeing about progression.
 *
 * `PROGRESSION` in src/config/economy.ts mirrors production_multiplier(),
 * upgrade_cost(), worker_cost() and max_workers() in the migrations, so a
 * player can be shown what an upgrade costs before they commit to it.
 *
 * The database is the authority - it is what actually charges them - so if
 * these ever drift, the player is quoted one price and charged another. This
 * pins the coefficients on both sides: change one and this test fails,
 * pointing at the other.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

/** The body of a SQL function, from its signature to the closing `$$`. */
function body(name: string): string {
  const marker = `function public.${name}(`;
  const start = sql.indexOf(marker);
  expect(start, `${name}() is not defined in any migration`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("$$;");
  return rest.slice(0, end === -1 ? rest.length : end);
}

describe("progression parity between the UI and the database", () => {
  it("output multiplier uses the same coefficients", () => {
    const fn = body("production_multiplier");
    // 1 + 0.5 per level above the first, times 1 + 0.12 per worker.
    expect(fn).toContain("0.5");
    expect(fn).toContain("0.12");

    // And the TypeScript mirror agrees on concrete cases.
    expect(PROGRESSION.outputMultiplier(1, 0)).toBe(1);
    expect(PROGRESSION.outputMultiplier(2, 0)).toBe(1.5);
    expect(PROGRESSION.outputMultiplier(5, 0)).toBe(3);
    expect(PROGRESSION.outputMultiplier(2, 1)).toBeCloseTo(1.5 * 1.12, 10);
    expect(PROGRESSION.outputMultiplier(5, 10)).toBeCloseTo(3 * 2.2, 10);
  });

  it("worker slots use the same rule", () => {
    expect(body("max_workers")).toContain("* 2");
    expect(PROGRESSION.maxWorkers(1)).toBe(2);
    expect(PROGRESSION.maxWorkers(5)).toBe(10);
  });

  it("upgrade cost uses the same coefficient", () => {
    expect(body("upgrade_cost")).toContain("0.75");
    expect(PROGRESSION.upgradeCost(5000, 1)).toBe(3750);
    expect(PROGRESSION.upgradeCost(5000, 4)).toBe(15000);
  });

  it("worker cost uses the same coefficient", () => {
    expect(body("worker_cost")).toContain("0.05");
    expect(PROGRESSION.workerCost(5000)).toBe(250);
    expect(PROGRESSION.workerCost(15000)).toBe(750);
  });

  it("treats level 1 and zero workers as the floor, never below", () => {
    // The SQL clamps with greatest(); the mirror must too, or a bad level
    // would quote a negative multiplier.
    expect(PROGRESSION.outputMultiplier(0, -5)).toBe(1);
    expect(PROGRESSION.maxWorkers(0)).toBe(2);
    expect(PROGRESSION.upgradeCost(5000, 0)).toBe(3750);
  });
});
