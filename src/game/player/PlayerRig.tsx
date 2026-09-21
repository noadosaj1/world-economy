"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { plotAt, worldExtent, type WorldData, type WorldPlot } from "@/game/world/grid";
import { useKeyboard } from "./useKeyboard";

/**
 * Third-person player: a stylised avatar plus a smoothed chase camera.
 *
 * Movement is WASD relative to where the camera is looking, drag to turn,
 * wheel to zoom. Deliberately arcade - no physics, no momentum - which keeps
 * it readable and avoids motion sickness.
 *
 * This controls only the *camera and avatar*. Nothing here can change money,
 * ownership or any other game state; standing somewhere is not a transaction.
 */

const WALK_SPEED = 14;
const RUN_SPEED = 26;
const TURN_SENSITIVITY = 0.0045;
const CAMERA_LERP = 0.1;
const MIN_ZOOM = 14;
const MAX_ZOOM = 80;

export type PlayerStatus = {
  x: number;
  z: number;
  plot: WorldPlot | null;
  moving: boolean;
};

export function PlayerRig({
  data,
  spawn,
  onStatus,
  onInteract,
}: {
  data: WorldData;
  spawn: [number, number];
  onStatus?: (status: PlayerStatus) => void;
  /** Fired when the player presses E. */
  onInteract?: () => void;
}) {
  const avatarRef = useRef<THREE.Group>(null);
  const keys = useKeyboard(onInteract);
  const { camera, gl } = useThree();

  const state = useRef({
    position: new THREE.Vector3(spawn[0], 0, spawn[1]),
    yaw: 0,
    pitch: 0.62,
    zoom: 34,
    facing: 0,
    dragging: false,
    lastReport: 0,
    lastPlotId: "",
  });

  const scratch = useMemo(
    () => ({
      move: new THREE.Vector3(),
      desired: new THREE.Vector3(),
      target: new THREE.Vector3(),
    }),
    [],
  );

  // Camera orbit: drag to turn, wheel to zoom.
  useEffect(() => {
    const canvas = gl.domElement;
    const current = state.current;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      current.dragging = true;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerUp = (event: PointerEvent) => {
      current.dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!current.dragging) return;
      current.yaw -= event.movementX * TURN_SENSITIVITY;
      current.pitch = THREE.MathUtils.clamp(
        current.pitch - event.movementY * TURN_SENSITIVITY,
        0.16,
        1.25,
      );
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      current.zoom = THREE.MathUtils.clamp(
        current.zoom + event.deltaY * 0.03,
        MIN_ZOOM,
        MAX_ZOOM,
      );
    };

    // Right-drag turns the camera; don't also open the browser menu.
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    // Clamp delta so a tab that was backgrounded doesn't teleport the player.
    const delta = Math.min(rawDelta, 0.1);
    const current = state.current;
    const pressed = keys.current;

    const forward = (pressed.forward ? 1 : 0) - (pressed.back ? 1 : 0);
    const strafe = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0);
    const moving = forward !== 0 || strafe !== 0;

    if (moving) {
      // Move relative to the camera's heading.
      const sin = Math.sin(current.yaw);
      const cos = Math.cos(current.yaw);
      scratch.move.set(strafe * cos - forward * sin, 0, -strafe * sin - forward * cos);
      scratch.move.normalize();

      const speed = pressed.run ? RUN_SPEED : WALK_SPEED;
      current.position.addScaledVector(scratch.move, speed * delta);

      const limit = worldExtent(data);
      current.position.x = THREE.MathUtils.clamp(current.position.x, -limit, limit);
      current.position.z = THREE.MathUtils.clamp(current.position.z, -limit, limit);

      current.facing = Math.atan2(scratch.move.x, scratch.move.z);
    }

    const avatar = avatarRef.current;
    if (avatar) {
      avatar.position.copy(current.position);
      // Turn towards the direction of travel instead of snapping.
      avatar.rotation.y = dampAngle(avatar.rotation.y, current.facing, 0.25);
      // A small bob while walking: cheap, and it sells the movement.
      avatar.position.y = moving ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.35 : 0;
    }

    // Chase camera.
    const horizontal = Math.cos(current.pitch) * current.zoom;
    scratch.desired.set(
      current.position.x + Math.sin(current.yaw) * horizontal,
      current.position.y + Math.sin(current.pitch) * current.zoom + 2,
      current.position.z + Math.cos(current.yaw) * horizontal,
    );
    camera.position.lerp(scratch.desired, CAMERA_LERP);
    scratch.target.set(current.position.x, current.position.y + 3.2, current.position.z);
    camera.lookAt(scratch.target);

    // Report position to the HUD a few times a second, not every frame.
    const now = performance.now();
    const plot = plotAt(data, current.position.x, current.position.z);
    const plotChanged = (plot?.id ?? "") !== current.lastPlotId;

    if (onStatus && (plotChanged || now - current.lastReport > 250)) {
      current.lastReport = now;
      current.lastPlotId = plot?.id ?? "";
      onStatus({ x: current.position.x, z: current.position.z, plot, moving });
    }
  });

  return (
    <group ref={avatarRef} position={[spawn[0], 0, spawn[1]]}>
      {/* Stylised humanoid: readable at a distance, cheap to draw. */}
      <mesh position={[0, 2.1, 0]} castShadow>
        <capsuleGeometry args={[0.85, 1.7, 4, 12]} />
        <meshStandardMaterial color="#6366f1" roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.9, 0]} castShadow>
        <sphereGeometry args={[0.72, 16, 12]} />
        <meshStandardMaterial color="#f8d9b0" roughness={0.6} />
      </mesh>
      {/* Facing marker, so you can always tell which way you're pointed. */}
      <mesh position={[0, 2.4, 0.9]}>
        <boxGeometry args={[0.5, 0.35, 0.3]} />
        <meshStandardMaterial color="#a3e635" emissive="#a3e635" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

/** Shortest-path angle damping, so turning never spins the long way round. */
function dampAngle(current: number, target: number, factor: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}
