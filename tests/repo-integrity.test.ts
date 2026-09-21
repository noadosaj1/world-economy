import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against source files being silently excluded from the repository.
 *
 * `.gitignore` had an unanchored `build/`, which matched the app route
 * `src/app/(game)/build/` as well as build output. The page worked locally and
 * simply would not have existed in production - no error, just a 404 on a
 * feature that was supposedly shipped.
 *
 * Nothing else catches this: it type-checks, lints, tests and builds, because
 * the file is right there on disk.
 */

const ROOT = process.cwd();
const SOURCE_DIRS = ["src", "supabase", "tests", "scripts"];
const SOURCE_FILE = /\.(ts|tsx|css|sql|sh|mjs)$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

/**
 * Which of these paths git would ignore.
 *
 * Deliberately not "is it tracked": a file being written right now is
 * untracked and that is fine. A source file being *ignored* is the bug.
 */
function ignoredFiles(paths: string[]): string[] {
  if (paths.length === 0) return [];

  try {
    const output = execFileSync("git", ["check-ignore", "--stdin"], {
      cwd: ROOT,
      encoding: "utf8",
      input: paths.join("\n"),
      maxBuffer: 32 * 1024 * 1024,
    });
    return output.split("\n").filter(Boolean);
  } catch (error) {
    // check-ignore exits 1 when nothing matches, which is the healthy case.
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

describe("repository integrity", () => {
  const onDisk = SOURCE_DIRS.flatMap((dir) => {
    try {
      return walk(join(ROOT, dir));
    } catch {
      return [];
    }
  });

  it("finds the source files it is meant to be checking", () => {
    expect(onDisk.length).toBeGreaterThan(20);
  });

  it("never lets .gitignore exclude a source file", () => {
    const ignored = ignoredFiles(onDisk.map((path) => relative(ROOT, path)));

    expect(
      ignored,
      "these source files are excluded by .gitignore, so they would be missing " +
        "from a deploy - look for an unanchored rule like `build/` that also " +
        "matches an app route",
    ).toEqual([]);
  });
});
