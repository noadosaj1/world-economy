"use client";

import { useRef, type ComponentRef } from "react";
import { MapControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { worldExtent, type WorldData } from "./grid";
import { useMapKeys } from "./useMapKeys";

/**
 * The map camera: an angled overhead view you pan, zoom and rotate.
 *
 * Drag pans across the city, wheel zooms, right-drag rotates. The polar angle
 * is clamped so the camera can never drop to ground level or go fully
 * top-down, which is what keeps the isometric city-builder feel instead of a
 * first-person one. Panning is bounded to the island so you cannot lose the
 * city off-screen.
 */

const PAN_SPEED = 240;
const FAST_MULTIPLIER = 2.4;

export function MapCamera({
  data,
  onEscape,
}: {
  data: WorldData;
  onEscape?: () => void;
}) {
  // Typed from drei itself, so the controls implementation is not imported
  // from a transitive dependency.
  const controlsRef = useRef<ComponentRef<typeof MapControls>>(null);
  const keys = useMapKeys(onEscape);
  const extent = worldExtent(data);

  // The camera comes from the frame state rather than useThree(), so this
  // component never mutates a value captured during render. Its opening
  // position is set declaratively on <Canvas>.
  useFrame(({ camera }, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const delta = Math.min(rawDelta, 0.1);
    const pressed = keys.current;
    const north = (pressed.north ? 1 : 0) - (pressed.south ? 1 : 0);
    const east = (pressed.east ? 1 : 0) - (pressed.west ? 1 : 0);
    if (north === 0 && east === 0) return;

    // Pan along the camera's own heading so "up" always means "away".
    const yaw = Math.atan2(
      camera.position.x - controls.target.x,
      camera.position.z - controls.target.z,
    );
    const speed = PAN_SPEED * (pressed.fast ? FAST_MULTIPLIER : 1) * delta;

    const dx = (east * Math.cos(yaw) - north * Math.sin(yaw)) * speed;
    const dz = (-east * Math.sin(yaw) - north * Math.cos(yaw)) * speed;

    const limit = extent * 1.15;
    const nextX = Math.max(-limit, Math.min(limit, controls.target.x + dx));
    const nextZ = Math.max(-limit, Math.min(limit, controls.target.z + dz));

    camera.position.x += nextX - controls.target.x;
    camera.position.z += nextZ - controls.target.z;
    controls.target.x = nextX;
    controls.target.z = nextZ;
    controls.update();
  });

  return (
    <MapControls
      ref={controlsRef}
      // Never look from underneath, never fully top-down.
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2.45}
      minDistance={70}
      // Far enough out to fit the entire island in frame at the opening view.
      maxDistance={extent * 4}
      // Damping makes dragging feel weighty rather than twitchy.
      enableDamping
      dampingFactor={0.12}
      // Screen-space panning would drift off the ground plane.
      screenSpacePanning={false}
      zoomSpeed={0.8}
      panSpeed={0.9}
      rotateSpeed={0.5}
      makeDefault
    />
  );
}
