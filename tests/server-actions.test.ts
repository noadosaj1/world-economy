import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the `"use server"` contract.
 *
 * A server-action module may only export async functions. Exporting a plain
 * object from one throws at request time:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * Nothing catches that earlier - it type-checks, lints and builds cleanly, and
 * only fails when a player submits the form. It took down /signup in
 * production once, so it is asserted here instead.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Files that actually carry the directive, i.e. have it as their first line. */
function serverActionModules(): string[] {
  return walk(SRC).filter((path) => {
    const first = readFileSync(path, "utf8").split("\n")[0]?.trim() ?? "";
    return first === '"use server";' || first === "'use server';";
  });
}

/** Exports that are legal in a server-action module. */
const LEGAL = [
  /^export async function /,
  // Types are erased at compile time, so they never reach the runtime check.
  /^export type /,
  /^export interface /,
];

describe('"use server" modules', () => {
  const modules = serverActionModules();

  it("finds the server-action modules it is meant to be checking", () => {
    expect(modules.length).toBeGreaterThan(0);
    expect(modules.some((m) => m.includes("actions.ts"))).toBe(true);
  });

  it("export only async functions", () => {
    for (const path of modules) {
      const exports = readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.startsWith("export "));

      for (const line of exports) {
        const legal = LEGAL.some((pattern) => pattern.test(line));
        expect(
          legal,
          `${path.replace(process.cwd(), ".")} exports something that is not an ` +
            `async function, which throws at request time:\n    ${line}`,
        ).toBe(true);
      }
    }
  });

  it("never re-export a value from elsewhere", () => {
    // `export { thing } from "./x"` can smuggle in a non-function.
    for (const path of modules) {
      const code = readFileSync(path, "utf8");
      const reExports = [...code.matchAll(/^export\s*\{[^}]*\}\s*(from|;)/gm)]
        // A type-only re-export is erased and therefore harmless.
        .filter((match) => !match[0].startsWith("export type"));
      expect(reExports.map((m) => m[0]), path).toEqual([]);
    }
  });
});

/**
 * Guards the server/client boundary.
 *
 * A Server Component may only pass a *reference* to a server action across to
 * a Client Component. Wrapping one in an inline arrow makes it an ordinary
 * function, which React cannot serialise, and the page throws at request time:
 *
 *   Functions cannot be passed directly to Client Components.
 *
 * Like the `"use server"` rule, this type-checks and builds cleanly and only
 * fails when the page is actually rendered.
 */
describe("server actions passed to client components", () => {
  const files = walk(SRC).filter((path) => path.endsWith(".tsx"));

  it("finds the pages it is meant to be checking", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("are passed by reference, never wrapped in an inline function", () => {
    for (const path of files) {
      const code = readFileSync(path, "utf8");
      // Only applies to server components; a client component may define
      // handlers inline freely.
      if (code.split("\n")[0]?.trim() === '"use client";') continue;

      const inline = [
        ...code.matchAll(/\baction=\{\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g),
      ];
      expect(
        inline.map((m) => m[0]),
        `${path.replace(process.cwd(), ".")} passes an inline function as \`action\`, ` +
          `which cannot cross the server/client boundary`,
      ).toEqual([]);
    }
  });
});
