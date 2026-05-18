"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";

type CursorMode = "idle" | "hover" | "pressed" | "disabled";

const INTERACTIVE_SELECTOR = 'a[href], button, [role="button"], [role="menuitemradio"], summary';
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const DISABLED_SELECTOR = 'button:disabled, [aria-disabled="true"]';

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
  const pressedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");

    function syncEnabled() {
      setEnabled(media.matches);
      document.documentElement.classList.toggle("custom-cursor-enabled", media.matches);
      if (!media.matches) {
        setVisible(false);
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

      setPoint({ x: event.clientX, y: event.clientY });
      setVisible(true);
      setModeFromTarget(event.target);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!media.matches || event.pointerType === "touch") {
        return;
      }

      pressedRef.current = true;
      setPoint({ x: event.clientX, y: event.clientY });
      setModeFromTarget(event.target);
    }

    function handlePointerUp(event: PointerEvent) {
      pressedRef.current = false;
      setModeFromTarget(event.target);
    }

    function handlePointerLeave() {
      setVisible(false);
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
          "--cursor-y": `${point.y}px`
        } as CSSProperties
      }
    >
      <span />
    </div>
  );
}
