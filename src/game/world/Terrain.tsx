"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { cellNoise, worldExtent, type WorldData } from "./grid";

/**
 * The island the city sits on: a round green plateau, a sand shore, shallow
 * water, then open ocean fading into the horizon.
 *
 * Circles rather than squares on purpose - a rectangular shoreline reads as a
 * slab floating on blue, while a round one reads as land. The city grid itself
 * stays square; the coast is what softens it.
 */

const GRASS = "#78a855";
const GRASS_DARK = "#659144";
const SAND = "#e6d8ae";
const SHALLOW = "#38b3d6";
const DEEP = "#12617f";

export function Terrain({ data }: { data: WorldData }) {
  const extent = worldExtent(data);

  // The grass must reach the corners of the square grid, which sit further out
  // than its edges.
  const grassRadius = extent * 1.44;
  const sandRadius = extent * 1.62;
  const shallowRadius = extent * 2.1;

  // A gentle two-tone speckle, drawn into a canvas rather than downloaded, so
  // the world needs no texture assets at all.
  const grassTexture = useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, size, size);

    // Deterministic: the same texture every render, and no impure call during
    // rendering.
    ctx.fillStyle = GRASS_DARK;
    for (let i = 0; i < 110; i += 1) {
      ctx.fillRect(cellNoise(i, 1, 5) * size, cellNoise(i, 2, 9) * size, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(30, 30);
    return texture;
  }, []);

  return (
    <group>
      {/* Open ocean, large enough to fill the horizon at every zoom level. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]}>
        <planeGeometry args={[extent * 30, extent * 30]} />
        <meshStandardMaterial color={DEEP} roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Shallow water close in, a shade brighter. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
        <circleGeometry args={[shallowRadius, 96]} />
        <meshStandardMaterial color={SHALLOW} roughness={0.25} metalness={0.25} />
      </mesh>

      {/* Sand shore. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <circleGeometry args={[sandRadius, 96]} />
        <meshStandardMaterial color={SAND} roughness={0.95} />
      </mesh>

      {/* The green the city is built on. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[grassRadius, 96]} />
        <meshStandardMaterial
          color={grassTexture ? "#ffffff" : GRASS}
          map={grassTexture}
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}
