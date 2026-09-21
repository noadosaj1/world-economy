"use client";

import { useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import { Terrain } from "./Terrain";
import { RoadNetwork } from "./RoadNetwork";
import { CityBlocks } from "./CityBlocks";
import { PlotPads } from "./PlotPads";
import { PlotLabels } from "./PlotLabels";
import { MapCamera } from "./MapCamera";
import { CityHud } from "./CityHud";
import { worldExtent, type WorldData, type WorldPlot } from "./grid";

/**
 * The city map.
 *
 * An angled overhead view of the whole world that you pan, zoom and click -
 * not a world you walk around in. Plot positions, prices, zones and ownership
 * all come from the database; the canvas draws them and never invents them.
 *
 * Loaded through a dynamic import (see WorldView) so Three.js stays out of the
 * bundle for players who are only looking at menus.
 */
export function CityCanvas({
  data,
  playerName,
  companyLabel,
  cash,
}: {
  data: WorldData;
  playerName: string;
  companyLabel: string | null;
  cash: string;
}) {
  const [selected, setSelected] = useState<WorldPlot | null>(null);
  const [hovered, setHovered] = useState<WorldPlot | null>(null);

  const extent = worldExtent(data);

  const worldStats = useMemo(
    () => ({
      total: data.plots.length,
      available: data.plots.filter((plot) => !plot.ownerId && plot.isPurchasable).length,
    }),
    [data.plots],
  );

  const plotCount = useMemo(
    () => data.plots.filter((plot) => plot.isMine).length,
    [data.plots],
  );

  const clearSelection = useCallback(() => setSelected(null), []);

  return (
    <div
      className="canvas-host relative h-full w-full"
      style={{ cursor: hovered ? "pointer" : "grab" }}
    >
      <Canvas
        shadows
        dpr={[1, 1.8]}
        // Opens far enough back to take in the whole island at once.
        camera={{
          fov: 38,
          near: 1,
          far: extent * 12,
          position: [extent * 1.2, extent * 1.9, extent * 2.0],
        }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          // Fog fades the far ocean out, which is what gives the map its
          // vignetted, tabletop look.
          scene.fog = new THREE.Fog("#0a1024", extent * 3.2, extent * 7);
        }}
        // Clicking empty water dismisses the selection.
        onPointerMissed={clearSelection}
      >
        <color attach="background" args={["#0a1024"]} />

        {/* Bright sky fill keeps shaded streets readable rather than black. */}
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#e8f0ff", "#5b6480", 1.15]} />
        <directionalLight
          position={[extent * 0.8, extent * 1.4, extent * 0.5]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-extent * 1.2}
          shadow-camera-right={extent * 1.2}
          shadow-camera-top={extent * 1.2}
          shadow-camera-bottom={-extent * 1.2}
          shadow-camera-far={extent * 4}
          shadow-bias={-0.0005}
        />

        <Terrain data={data} />
        <RoadNetwork data={data} />
        <CityBlocks data={data} />
        <PlotPads
          data={data}
          selectedId={selected?.id ?? null}
          hoveredId={hovered?.id ?? null}
          onSelect={setSelected}
          onHover={setHovered}
        />
        <PlotLabels data={data} selectedId={selected?.id ?? null} onSelect={setSelected} />

        <MapCamera data={data} onEscape={clearSelection} />
        <AdaptiveDpr pixelated />
      </Canvas>

      <CityHud
        playerName={playerName}
        companyLabel={companyLabel}
        cash={cash}
        plotCount={plotCount}
        selected={selected}
        onClose={clearSelection}
        worldStats={worldStats}
      />
    </div>
  );
}
