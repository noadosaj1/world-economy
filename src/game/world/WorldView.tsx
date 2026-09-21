"use client";

import dynamic from "next/dynamic";
import type { WorldData } from "./grid";

/**
 * Loads the 3D world lazily.
 *
 * Three.js, R3F and drei are a large bundle. Keeping them behind a dynamic
 * import means the dashboard, company and land pages stay light, and players
 * see a proper loading state instead of a blank frame.
 */
const WorldCanvas = dynamic(
  () => import("./WorldCanvas").then((m) => ({ default: m.WorldCanvas })),
  {
    ssr: false,
    loading: () => <WorldLoading />,
  },
);

function WorldLoading() {
  return (
    <div className="grid h-full w-full place-items-center bg-ink-950">
      <div className="text-center">
        <div
          aria-hidden
          className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400"
        />
        <p className="mt-4 font-[family-name:var(--font-display)] text-sm font-bold tracking-wide text-slate-300 uppercase">
          Loading the world
        </p>
        <p className="mt-1 text-xs text-slate-500">Streaming districts and plots…</p>
      </div>
    </div>
  );
}

export function WorldView(props: {
  data: WorldData;
  playerName: string;
  companyLabel: string | null;
  cash: string;
}) {
  return <WorldCanvas {...props} />;
}
