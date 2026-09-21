"use client";

import { useMemo } from "react";
import { ZONES } from "@/config/economy";
import { cellToWorld, mix, shade, type WorldData, type WorldPlot } from "./grid";
import { InstancedTiles, type TileInstance } from "./InstancedTiles";

/**
 * The clickable ground of every plot.
 *
 * This is the map's primary interaction surface: click a plot to select it.
 * Colour carries ownership at a glance - your land is bright lime, another
 * player's is their zone colour, unclaimed land is muted.
 */

export function PlotPads({
  data,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  data: WorldData;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (plot: WorldPlot) => void;
  onHover: (plot: WorldPlot | null) => void;
}) {
  const { cellSize } = data;

  const instances = useMemo<TileInstance[]>(
    () =>
      data.plots.map((plot) => {
        const zone = ZONES[plot.zone];
        // Unclaimed land is mown grass with only a hint of its district, so
        // the map stays bright and ownership is the thing that stands out.
        const base = plot.isMine
          ? "#b9f25c"
          : plot.ownerId
            ? mix("#7fae5c", zone.color, 0.78)
            : mix("#84b562", zone.color, 0.2);

        const active = plot.id === selectedId || plot.id === hoveredId;

        return {
          position: [
            cellToWorld(plot.gridX, cellSize),
            0.22,
            cellToWorld(plot.gridZ, cellSize),
          ],
          scale: [cellSize * 0.9, 0.44, cellSize * 0.9],
          color: active ? shade(base, 0.35) : base,
        };
      }),
    [data.plots, cellSize, selectedId, hoveredId],
  );

  const selected = data.plots.find((plot) => plot.id === selectedId);

  return (
    <group>
      <InstancedTiles
        instances={instances}
        roughness={0.85}
        onSelect={(index) => {
          const plot = data.plots[index];
          if (plot) onSelect(plot);
        }}
        onHover={(index) => onHover(index === null ? null : (data.plots[index] ?? null))}
      />

      {/* Selection outline, drawn just above the pad. */}
      {selected ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            cellToWorld(selected.gridX, cellSize),
            0.47,
            cellToWorld(selected.gridZ, cellSize),
          ]}
        >
          <ringGeometry args={[cellSize * 0.4, cellSize * 0.47, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}
