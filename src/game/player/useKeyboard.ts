"use client";

import { useEffect, useRef } from "react";

/**
 * Tracks which movement keys are held.
 *
 * A ref rather than state on purpose: the render loop reads it every frame and
 * must not re-render React 60 times a second.
 */

export type KeyState = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
};

const KEY_MAP: Record<string, keyof KeyState> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
};

export function useKeyboard(onInteract?: () => void) {
  const keys = useRef<KeyState>({
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
  });
  // Kept in a ref and synced in an effect so the key listeners below are
  // attached once, not re-attached whenever the callback identity changes.
  const interactRef = useRef(onInteract);

  useEffect(() => {
    interactRef.current = onInteract;
  }, [onInteract]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;

      const action = KEY_MAP[event.code];
      if (action) {
        keys.current[action] = true;
        // Stop arrow keys and space from scrolling the page under the canvas.
        if (event.code.startsWith("Arrow")) event.preventDefault();
        return;
      }

      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        interactRef.current?.();
      }
    };

    const up = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.code];
      if (action) keys.current[action] = false;
    };

    // Releasing a key while the tab is hidden would otherwise stick it down.
    const clear = () => {
      keys.current = { forward: false, back: false, left: false, right: false, run: false };
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
