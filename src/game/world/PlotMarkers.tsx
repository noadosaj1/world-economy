"use client";

import { Html } from "@react-three/drei";
import { cellToWorld, type WorldData, type WorldPlot } from "./grid";
import { ZONES } from "@/config/economy";

/**
 * Signs above owned land.
 *
 * Every label here is real persisted data: the owning company's ticker, read
 * from the `companies` table. Unowned plots get nothing, so the world never
 * advertises a business that doesn't exist.
 */
export function PlotMarkers({ data }: { data: WorldData }) {
  const owned = data.plots.filter((plot) => plot.ownerId);

  return (
    <group>
      {owned.map((plot) => (
        <PlotSign key={plot.id} plot={plot} cellSize={data.cellSize} />
      ))}
    </group>
  );
}

function PlotSign({ plot, cellSize }: { plot: WorldPlot; cellSize: number }) {
  const zone = ZONES[plot.zone];
  const x = cellToWorld(plot.gridX, cellSize);
  const z = cellToWorld(plot.gridZ, cellSize);

  return (
    <group position={[x, 1.1, z]}>
      {/* Sign post */}
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 6, 8]} />
        <meshStandardMaterial color="#475178" />
      </mesh>

      {/* A glowing outline so your own land is obvious from a distance. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[cellSize * 0.42, cellSize * 0.46, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial
          color={plot.isMine ? "#a3e635" : zone.color}
          transparent
          opacity={plot.isMine ? 0.95 : 0.5}
        />
      </mesh>

      <Html
        position={[0, 7.4, 0]}
        center
        distanceFactor={70}
        occlude={false}
        zIndexRange={[20, 0]}
      >
        <div
          className="pointer-events-none flex -translate-y-1/2 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap shadow-lg"
          style={{
            background: plot.isMine ? "#1a2e05" : "#0c1023e6",
            color: plot.isMine ? "#d9f99d" : "#e6e9f5",
            border: `1px solid ${plot.isMine ? "#a3e635" : zone.color}`,
          }}
        >
          <span style={{ color: plot.isMine ? "#a3e635" : zone.color }}>
            {plot.isMine ? "◆" : "◇"}
          </span>
          {plot.ownerLabel ?? "Claimed"}
        </div>
      </Html>
    </group>
  );
}
