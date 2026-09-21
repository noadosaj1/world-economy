"use client";

import { useEffect, useRef } from "react";

/**
 * WASD / arrow-key panning for the map camera.
 *
 * Held keys live in a ref because the render loop reads them every frame and
 * must not re-render React sixty times a second.
 */

export type PanState = {
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
  fast: boolean;
};

const KEY_MAP: Record<string, keyof PanState> = {
  KeyW: "north",
  ArrowUp: "north",
  KeyS: "south",
  ArrowDown: "south",
  KeyA: "west",
  ArrowLeft: "west",
  KeyD: "east",
  ArrowRight: "east",
  ShiftLeft: "fast",
  ShiftRight: "fast",
};

export function useMapKeys(onEscape?: () => void) {
  const keys = useRef<PanState>({
    north: false,
    south: false,
    west: false,
    east: false,
    fast: false,
  });

  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      if (event.code === "Escape") {
        escapeRef.current?.();
        return;
      }

      const action = KEY_MAP[event.code];
      if (!action) return;
      keys.current[action] = true;
      // Stop arrow keys scrolling the page under the canvas.
      if (event.code.startsWith("Arrow")) event.preventDefault();
    };

    const up = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.code];
      if (action) keys.current[action] = false;
    };

    // A key released while the tab is hidden would otherwise stick down.
    const clear = () => {
      keys.current = { north: false, south: false, west: false, east: false, fast: false };
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return keys;
}
