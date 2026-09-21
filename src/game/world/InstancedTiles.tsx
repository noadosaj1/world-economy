"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/**
 * One draw call for many boxes.
 *
 * The city is made of hundreds of plot pads, road tiles, buildings and trees.
 * Each set goes through here as a single InstancedMesh instead of hundreds of
 * React components, which is what keeps the map cheap in a browser.
 *
 * Optionally interactive: `onSelect` and `onHover` report the instance index,
 * which callers map back to whichever plot that instance was built from.
 */

export type TileInstance = {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
};

export function InstancedTiles({
  instances,
  roughness = 0.85,
  metalness = 0.05,
  castShadow = false,
  receiveShadow = true,
  onSelect,
  onHover,
}: {
  instances: TileInstance[];
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  onSelect?: (index: number) => void;
  onHover?: (index: number | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = instances.length;
  const interactive = Boolean(onSelect || onHover);

  // Reused scratch objects: allocating per instance per commit would churn the
  // garbage collector for no reason.
  const scratch = useMemo(
    () => ({ matrix: new THREE.Matrix4(), color: new THREE.Color() }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    for (let i = 0; i < count; i += 1) {
      const instance = instances[i]!;
      scratch.matrix.makeScale(instance.scale[0], instance.scale[1], instance.scale[2]);
      scratch.matrix.setPosition(
        instance.position[0],
        instance.position[1],
        instance.position[2],
      );
      mesh.setMatrixAt(i, scratch.matrix);
      mesh.setColorAt(i, scratch.color.set(instance.color));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances, count, scratch]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
      onClick={
        onSelect &&
        ((event: ThreeEvent<MouseEvent>) => {
          // Only the nearest instance under the cursor, not everything the ray
          // passes through.
          event.stopPropagation();
          if (event.instanceId !== undefined) onSelect(event.instanceId);
        })
      }
      onPointerMove={
        onHover &&
        ((event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          if (event.instanceId !== undefined) onHover(event.instanceId);
        })
      }
      onPointerOut={onHover && (() => onHover(null))}
      // Without this, the raycaster tests every instance on every pointer move.
      raycast={interactive ? undefined : () => null}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}
