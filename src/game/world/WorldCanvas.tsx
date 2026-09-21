"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, Sky } from "@react-three/drei";
import * as THREE from "three";
import { PlayerRig, type PlayerStatus } from "@/game/player/PlayerRig";
import { WorldScene } from "./WorldScene";
import { PlotMarkers } from "./PlotMarkers";
import { WorldHud } from "./WorldHud";
import { cellToWorld, type WorldData } from "./grid";

/**
 * The 3D world.
 *
 * Mounted through a dynamic import (see WorldView) so Three.js never lands in
 * the initial bundle for players who are only looking at menus.
 */
export function WorldCanvas({
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
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [inspected, setInspected] = useState<PlayerStatus["plot"]>(null);
  // The keyboard handler needs the live position without re-subscribing to it
  // on every movement tick.
  const statusRef = useRef<PlayerStatus | null>(null);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspected(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  // Spawn on the player's own land when they have some, otherwise the centre.
  const home = data.plots.find((plot) => plot.isMine);
  const spawn: [number, number] = home
    ? [
        cellToWorld(home.gridX, data.cellSize),
        cellToWorld(home.gridZ, data.cellSize) + data.cellSize * 0.8,
      ]
    : [0, 0];

  const handleInteract = useCallback(() => {
    // Toggle: E opens the inspector for the plot underfoot, E again closes it.
    setInspected((current) => (current ? null : (statusRef.current?.plot ?? null)));
  }, []);

  const handleStatus = useCallback((next: PlayerStatus) => {
    statusRef.current = next;
    setStatus(next);
    // Close the inspector once the player walks off the plot.
    setInspected((current) =>
      current && next.plot?.id !== current.id ? null : current,
    );
  }, []);

  return (
    <div className="canvas-host relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ fov: 52, near: 0.5, far: 1400, position: [0, 30, 40] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          scene.fog = new THREE.Fog("#0d1330", 260, 900);
        }}
      >
        <color attach="background" args={["#0d1330"]} />

        <Sky sunPosition={[120, 70, -90]} turbidity={7} rayleigh={0.9} />

        <hemisphereLight args={["#c9d4ff", "#141a35", 0.9]} />
        <directionalLight
          position={[120, 160, -90]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-220}
          shadow-camera-right={220}
          shadow-camera-top={220}
          shadow-camera-bottom={-220}
          shadow-camera-far={600}
          shadow-bias={-0.0006}
        />

        <WorldScene data={data} />
        <PlotMarkers data={data} />
        <PlayerRig
          data={data}
          spawn={spawn}
          onStatus={handleStatus}
          onInteract={handleInteract}
        />

        <AdaptiveDpr pixelated />
      </Canvas>

      <WorldHud
        playerName={playerName}
        companyLabel={companyLabel}
        cash={cash}
        status={status}
        inspected={inspected}
        onInspect={() => setInspected(status?.plot ?? null)}
        onCloseInspect={() => setInspected(null)}
      />
    </div>
  );
}
