import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the seam between the app and the database.
 *
 * A typo in an RPC name or a parameter name is invisible to TypeScript and
 * only shows up as a runtime failure for a player mid-action, so it is checked
 * here against the actual migration SQL.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SRC_DIR = join(process.cwd(), "src");

function readMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : /\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}

const sql = readMigrations();
const sources = walk(SRC_DIR).map((path) => ({
  path,
  code: readFileSync(path, "utf8"),
}));

/** Every `supabase.rpc("name", { ... })` call in the app. */
function findRpcCalls() {
  const calls: Array<{ file: string; name: string; params: string[] }> = [];
  const pattern = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`]\s*(?:,\s*\{([^}]*)\})?/gi;

  for (const { path, code } of sources) {
    for (const match of code.matchAll(pattern)) {
      const params = (match[2] ?? "")
        .split(",")
        .map((p) => p.split(":")[0]?.trim() ?? "")
        .filter((p) => /^p_[a-z0-9_]+$/.test(p));
      calls.push({ file: path, name: match[1]!, params });
    }
  }

  return calls;
}

describe("database RPC contract", () => {
  const calls = findRpcCalls();

  it("finds the RPC calls it is meant to be checking", () => {
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.map((c) => c.name)).toContain("complete_onboarding");
  });

  it("every function the app calls exists in the migrations", () => {
    for (const call of calls) {
      expect(
        sql.includes(`function public.${call.name}(`),
        `${call.name}() is called from ${call.file} but not defined in any migration`,
      ).toBe(true);
    }
  });

  it("every named parameter the app passes exists on the function", () => {
    for (const call of calls) {
      const signature = sql
        .split(`function public.${call.name}(`)[1]
        ?.split(")")[0];
      expect(signature, `signature for ${call.name}`).toBeDefined();

      for (const param of call.params) {
        expect(
          signature!.includes(param),
          `${call.name}() is called with "${param}" from ${call.file}, which is not a parameter of it`,
        ).toBe(true);
      }
    }
  });

  it("every function the app calls is granted to authenticated players", () => {
    for (const call of calls) {
      expect(
        new RegExp(`grant execute on function public\\.${call.name}\\(`).test(sql),
        `${call.name}() is called by the app but never granted to authenticated`,
      ).toBe(true);
    }
  });
});

describe("database safety invariants", () => {
  it("keeps row level security on for every table it creates", () => {
    const created = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1]!);
    expect(created.length).toBeGreaterThan(0);

    for (const table of created) {
      expect(
        sql.includes(`alter table public.${table}            enable row level security`) ||
          new RegExp(`alter table public\\.${table}\\s+enable row level security`).test(sql),
        `table ${table} never has RLS enabled`,
      ).toBe(true);
    }
  });

  it("never grants write access on an economic table to players", () => {
    // Writes must go through the SECURITY DEFINER functions, so no policy may
    // hand INSERT, UPDATE or DELETE to anon or authenticated.
    const writePolicies = [
      ...sql.matchAll(/create policy [a-z_]+ on public\.[a-z_]+\s+for (insert|update|delete|all)/g),
    ];
    expect(writePolicies.map((m) => m[0])).toEqual([]);
  });

  it("locks the wallet row before changing a balance", () => {
    const fn = sql.split("function public.apply_money_delta(")[1] ?? "";
    expect(fn).toContain("for update");
    expect(fn).toContain("INSUFFICIENT_FUNDS");
    // Every balance change writes an audit row in the same transaction.
    expect(fn).toContain("insert into public.player_transactions");
  });

  it("pins search_path on every security definer function", () => {
    const definers = sql.split("security definer").slice(1);
    expect(definers.length).toBeGreaterThan(0);
    for (const body of definers) {
      expect(body.slice(0, 120)).toContain("set search_path");
    }
  });
});
