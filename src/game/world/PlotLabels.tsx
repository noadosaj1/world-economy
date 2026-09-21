"use client";

import { useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { formatMoney } from "@/lib/economy/format";
import { cellToWorld, type WorldData, type WorldPlot } from "./grid";

/**
 * The floating tags over each plot: a price on unclaimed land, the owning
 * company's name on claimed land.
 *
 * These are DOM nodes, so they cannot all be on screen at once - 400 of them
 * would stall the page. Only the plots nearest the camera are labelled, capped
 * at MAX_LABELS, and the set is recomputed a few times a second rather than
 * every frame.
 *
 * Owner names come from the `companies` table. A plot with an owner but no
 * company row shows "Claimed" rather than inventing a name.
 */

const MAX_LABELS = 30;
/**
 * Above this camera distance tags are too small to read, so they are hidden
 * and the map reads as districts instead. Zooming in brings them back.
 */
const HIDE_ABOVE_DISTANCE = 430;
const RECOMPUTE_MS = 180;
/** Height above the plot that a tag floats at. */
const LABEL_HEIGHT = 7.5;
/**
 * Minimum gap between two tags on screen, in CSS pixels. Downtown plots are
 * only 20 world units apart, so without this the core becomes an unreadable
 * stack of overlapping prices.
 */
const MIN_GAP_X = 82;
const MIN_GAP_Y = 24;

export function PlotLabels({
  data,
  selectedId,
  onSelect,
}: {
  data: WorldData;
  selectedId: string | null;
  onSelect: (plot: WorldPlot) => void;
}) {
  const { camera, size } = useThree();
  const [visible, setVisible] = useState<WorldPlot[]>([]);
  const lastRun = useRef(0);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const now = performance.now();
    if (now - lastRun.current < RECOMPUTE_MS) return;
    lastRun.current = now;

    const distance = camera.position.length();
    if (distance > HIDE_ABOVE_DISTANCE) {
      setVisible((current) => (current.length === 0 ? current : []));
      return;
    }

    // Landmarks are never for sale and have no owner, so a tag over one
    // carries no information - it is just clutter.
    const onScreen: Array<{ plot: WorldPlot; sx: number; sy: number; fromCentre: number }> = [];
    const centreX = size.width / 2;
    const centreY = size.height / 2;

    for (const plot of data.plots) {
      if (plot.ownerId === null && !plot.isPurchasable) continue;

      projected
        .set(
          cellToWorld(plot.gridX, data.cellSize),
          LABEL_HEIGHT,
          cellToWorld(plot.gridZ, data.cellSize),
        )
        .project(camera);

      // Behind the camera.
      if (projected.z > 1) continue;

      const sx = (projected.x * 0.5 + 0.5) * size.width;
      const sy = (-projected.y * 0.5 + 0.5) * size.height;

      // Off screen, with a small margin so tags do not pop in at the edges.
      if (sx < -60 || sx > size.width + 60) continue;
      if (sy < -40 || sy > size.height + 40) continue;

      const dx = sx - centreX;
      const dy = sy - centreY;
      onScreen.push({ plot, sx, sy, fromCentre: dx * dx + dy * dy });
    }

    // Rank by distance from the middle of the view, not from the camera, so
    // tags spread across what the player is looking at instead of piling up
    // along the near edge of the screen.
    onScreen.sort((a, b) => a.fromCentre - b.fromCentre);

    const accepted: WorldPlot[] = [];
    const takenX: number[] = [];
    const takenY: number[] = [];

    for (const candidate of onScreen) {
      if (accepted.length >= MAX_LABELS) break;

      let clashes = false;
      for (let i = 0; i < takenX.length; i += 1) {
        if (
          Math.abs(takenX[i]! - candidate.sx) < MIN_GAP_X &&
          Math.abs(takenY[i]! - candidate.sy) < MIN_GAP_Y
        ) {
          clashes = true;
          break;
        }
      }
      if (clashes) continue;

      accepted.push(candidate.plot);
      takenX.push(candidate.sx);
      takenY.push(candidate.sy);
    }

    setVisible((current) => {
      if (
        current.length === accepted.length &&
        current.every((plot, i) => plot.id === accepted[i]!.id)
      ) {
        return current;
      }
      return accepted;
    });
  });

  return (
    <group>
      {visible.map((plot) => (
        <PlotLabel
          key={plot.id}
          plot={plot}
          cellSize={data.cellSize}
          selected={plot.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

function PlotLabel({
  plot,
  cellSize,
  selected,
  onSelect,
}: {
  plot: WorldPlot;
  cellSize: number;
  selected: boolean;
  onSelect: (plot: WorldPlot) => void;
}) {
  const owned = Boolean(plot.ownerId);

  const text = owned ? (plot.ownerLabel ?? "Claimed") : formatMoney(plot.price);

  const tone = plot.isMine
    ? { bg: "#1a2e05", border: "#a3e635", fg: "#d9f99d" }
    : owned
      ? { bg: "#0c1023", border: "#6366f1", fg: "#dbe2ff" }
      : { bg: "#f8fafc", border: "#cbd5e1", fg: "#0f172a" };

  return (
    <Html
      position={[
        cellToWorld(plot.gridX, cellSize),
        LABEL_HEIGHT,
        cellToWorld(plot.gridZ, cellSize),
      ]}
      center
      distanceFactor={150}
      zIndexRange={[10, 0]}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(plot);
        }}
        className="tnum cursor-pointer rounded-md px-1.5 py-0.5 text-[13px] leading-tight font-bold whitespace-nowrap shadow-md"
        style={{
          background: tone.bg,
          color: tone.fg,
          border: `1px solid ${selected ? "#ffffff" : tone.border}`,
          transform: selected ? "scale(1.12)" : undefined,
        }}
      >
        {text}
      </button>
    </Html>
  );
}
