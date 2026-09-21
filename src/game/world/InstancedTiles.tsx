"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * One draw call for many boxes.
 *
 * The world has hundreds of plot pads, road tiles and scenery blocks. Each set
 * goes through here as a single InstancedMesh instead of hundreds of React
 * components, which is what keeps the scene cheap in a browser.
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
}: {
  instances: TileInstance[];
  roughness?: number;
  metalness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = instances.length;

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
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}
