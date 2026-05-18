"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";

type CursorMode = "idle" | "hover" | "pressed" | "disabled";

const INTERACTIVE_SELECTOR = 'a[href], button, [role="button"], [role="menuitemradio"], [role="option"], summary';
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const DISABLED_SELECTOR = 'button:disabled, [aria-disabled="true"]';
const SWAY_RESET_MS = 90;
const MIN_SWAY_DISTANCE = 0.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function modeForTarget(target: EventTarget | null): CursorMode {
  if (!(target instanceof Element)) {
    return "idle";
  }

  if (target.closest(DISABLED_SELECTOR)) {
    return "disabled";
  }

  if (target.closest(TEXT_SELECTOR)) {
    return "idle";
  }

  if (target.closest(INTERACTIVE_SELECTOR)) {
    return "hover";
  }

  return "idle";
}

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<CursorMode>("idle");
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [sway, setSway] = useState({ x: 0, y: 0, rotate: 0 });
  const pressedRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const swayResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");

    function resetSway() {
      if (swayResetRef.current) {
        clearTimeout(swayResetRef.current);
        swayResetRef.current = null;
      }

      setSway({ x: 0, y: 0, rotate: 0 });
    }

    function syncEnabled() {
      setEnabled(media.matches);
      document.documentElement.classList.toggle("custom-cursor-enabled", media.matches);
      if (!media.matches) {
        setVisible(false);
        lastPointRef.current = null;
        resetSway();
      }
    }

    function setModeFromTarget(target: EventTarget | null) {
      const nextMode = modeForTarget(target);
      setMode(pressedRef.current && nextMode === "hover" ? "pressed" : nextMode);
    }

    function handlePointerMove(event: PointerEvent) {
      if (!media.matches || event.pointerType === "touch") {
        return;
      }

      const nextPoint = { x: event.clientX, y: event.clientY };
      const lastPoint = lastPointRef.current;
      lastPointRef.current = nextPoint;

      if (lastPoint) {
        const dx = nextPoint.x - lastPoint.x;
        const dy = nextPoint.y - lastPoint.y;
        const distance = Math.hypot(dx, dy);

        if (distance > MIN_SWAY_DISTANCE) {
          const directionX = dx / distance;
          const directionY = dy / distance;
          const strength = clamp(distance / 22, 0.35, 1);

          setSway({
            x: directionX * (2 + strength * 3),
            y: directionY * (1.25 + strength * 2.75),
            rotate: clamp(directionX * 8 + directionY * 4, -11, 11)
          });
        }

        if (swayResetRef.current) {
          clearTimeout(swayResetRef.current);
        }

        swayResetRef.current = setTimeout(() => {
          swayResetRef.current = null;
          setSway({ x: 0, y: 0, rotate: 0 });
        }, SWAY_RESET_MS);
      }

      setPoint(nextPoint);
      setVisible(true);
      setModeFromTarget(event.target);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!media.matches || event.pointerType === "touch") {
        return;
      }

      pressedRef.current = true;
      const nextPoint = { x: event.clientX, y: event.clientY };
      lastPointRef.current = nextPoint;
      setPoint(nextPoint);
      setModeFromTarget(event.target);
    }

    function handlePointerUp(event: PointerEvent) {
      pressedRef.current = false;
      setModeFromTarget(event.target);
    }

    function handlePointerLeave() {
      setVisible(false);
      lastPointRef.current = null;
      resetSway();
    }

    syncEnabled();
    media.addEventListener("change", syncEnabled);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      media.removeEventListener("change", syncEnabled);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      document.documentElement.classList.remove("custom-cursor-enabled");
      if (swayResetRef.current) {
        clearTimeout(swayResetRef.current);
        swayResetRef.current = null;
      }
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="custom-cursor"
      data-mode={mode}
      data-visible={visible}
      style={
        {
          "--cursor-x": `${point.x}px`,
          "--cursor-y": `${point.y}px`,
          "--cursor-sway-x": `${sway.x}px`,
          "--cursor-sway-y": `${sway.y}px`,
          "--cursor-sway-rotate": `${sway.rotate}deg`
        } as CSSProperties
      }
    >
      <span />
    </div>
  );
}
