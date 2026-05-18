"use client";

import { useEffect, useRef } from "react";
import { Phase, PlayerId, SpeakerId } from "@/lib/game/types";
import { createDisposableTracker, createPixelatedRenderer } from "./pixel-three";

type TableBackdropPlayer = {
  id: PlayerId;
  seat: number;
  alive: boolean;
};

type BackdropState = {
  activeSpeakerId?: SpeakerId;
  busy: boolean;
  paused: boolean;
  phase: Phase;
  players: TableBackdropPlayer[];
};

const SEAT_COORDS: Record<number, [number, number]> = {
  0: [-3.15, 1.85],
  1: [0, 2.35],
  2: [3.15, 1.85],
  3: [-2.72, -2.12],
  4: [2.72, -2.12],
  5: [0, -2.72]
};

export function TableScene3DBackdrop(props: BackdropState) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(props);

  useEffect(() => {
    stateRef.current = props;
  }, [props]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let disposed = false;
    let frameId = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let camera: import("three").OrthographicCamera | null = null;
    let scene: import("three").Scene | null = null;
    let renderStatic: (() => void) | null = null;
    let resizeRenderer: ((camera: import("three").OrthographicCamera) => void) | null = null;
    let disposeScene: (() => void) | null = null;
    let tickScene: ((elapsed: number, state: BackdropState) => void) | null = null;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0
    };

    const updateSize = () => {
      if (!camera || !resizeRenderer) {
        return;
      }

      resizeRenderer(camera);
      renderStatic?.();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (motionQuery.matches) {
        return;
      }

      const bounds = mount.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }

      pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };

    const start = async () => {
      try {
        const THREE = await import("three");
        if (disposed || !mountRef.current) {
          return;
        }

        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);

        const pixelRenderer = createPixelatedRenderer({
          THREE,
          mount,
          className: "table-3d-canvas",
          pixelScale: 3.5
        });
        renderer = pixelRenderer.renderer;
        resizeRenderer = pixelRenderer.resize;

        const table = buildTableScene(THREE, scene);
        disposeScene = table.dispose;
        tickScene = table.tick;

        renderStatic = () => {
          if (renderer && scene && camera) {
            renderer.render(scene, camera);
          }
        };

        updateSize();
        window.addEventListener("resize", updateSize);
        window.addEventListener("pointermove", handlePointerMove, { passive: true });

        if (motionQuery.matches) {
          tickScene(0, stateRef.current);
          renderStatic();
          return;
        }

        const animate = (time: number) => {
          if (disposed || !renderer || !scene || !camera) {
            return;
          }

          pointer.x += (pointer.targetX - pointer.x) * 0.045;
          pointer.y += (pointer.targetY - pointer.y) * 0.045;
          camera.position.x = pointer.x * 0.22;
          camera.position.y = -pointer.y * 0.16;
          camera.position.z = 10;
          camera.lookAt(pointer.x * 0.04, -pointer.y * 0.035, 0);

          tickScene?.(time * 0.001, stateRef.current);
          renderer.render(scene, camera);
          frameId = window.requestAnimationFrame(animate);
        };

        frameId = window.requestAnimationFrame(animate);
      } catch {
        mount.dataset.webgl = "unavailable";
      }
    };

    void start();

    return () => {
      disposed = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("pointermove", handlePointerMove);
      disposeScene?.();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="table-3d-backdrop" aria-hidden="true" />;
}

function buildTableScene(THREE: typeof import("three"), scene: import("three").Scene) {
  const { track, disposeAll } = createDisposableTracker();
  const root = new THREE.Group();
  const activeGroup = new THREE.Group();
  const candleGroup = new THREE.Group();
  const nightOverlay = new THREE.Group();
  const smokePuffs: import("three").Mesh[] = [];
  const seatGlows = new Map<number, import("three").Mesh<import("three").BufferGeometry, import("three").MeshBasicMaterial>>();
  const seatShadows = new Map<number, import("three").Mesh<import("three").BufferGeometry, import("three").MeshBasicMaterial>>();

  scene.add(root);
  root.scale.set(1.16, 1.12, 1);

  const feltMaterial = track(new THREE.MeshBasicMaterial({ color: 0x120d0a, transparent: true, opacity: 0.96 }));
  const tableEdgeMaterial = track(new THREE.MeshBasicMaterial({ color: 0x3b2415, transparent: true, opacity: 0.9 }));
  const innerGlowMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xd3a34c,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const lightPoolMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xe0a44a,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const lightHotspotMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xffd67a,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const candleShadowMaterial = track(new THREE.MeshBasicMaterial({ color: 0x050302, transparent: true, opacity: 0.34, depthWrite: false }));
  const candleMaterial = track(new THREE.MeshBasicMaterial({ color: 0xd38a38, transparent: true, opacity: 0.92 }));
  const candleTopMaterial = track(new THREE.MeshBasicMaterial({ color: 0xf2d48a, transparent: true, opacity: 0.9 }));
  const wickMaterial = track(new THREE.MeshBasicMaterial({ color: 0x1a0d08, transparent: true, opacity: 0.92 }));
  const flameHaloMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xff8b31,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const flameMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xffd36b,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const flameCoreMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xfff0a6,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const chairMaterial = track(new THREE.MeshBasicMaterial({ color: 0x070504, transparent: true, opacity: 0.84 }));
  const deadSeatMaterial = track(new THREE.MeshBasicMaterial({ color: 0x050404, transparent: true, opacity: 0.58 }));
  const seatGlowMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xd3a34c,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const activeMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xf4c56c,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const rippleMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xf4c56c,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const smokeMaterial = track(new THREE.MeshBasicMaterial({ color: 0x8c8172, transparent: true, opacity: 0.08, depthWrite: false }));
  const nightMaterial = track(new THREE.MeshBasicMaterial({ color: 0x07111a, transparent: true, opacity: 0.0, depthWrite: false }));

  const tableBase = new THREE.Mesh(track(new THREE.CircleGeometry(1, 72)), tableEdgeMaterial);
  tableBase.scale.set(4.55, 2.72, 1);
  root.add(tableBase);

  const felt = new THREE.Mesh(track(new THREE.CircleGeometry(1, 72)), feltMaterial);
  felt.scale.set(4.05, 2.34, 1);
  root.add(felt);

  const innerGlow = new THREE.Mesh(track(new THREE.CircleGeometry(1, 48)), innerGlowMaterial);
  innerGlow.scale.set(2.25, 1.12, 1);
  root.add(innerGlow);

  const lightPool = new THREE.Mesh(track(new THREE.CircleGeometry(1, 40)), lightPoolMaterial);
  lightPool.position.set(0, 0.02, 0.12);
  lightPool.scale.set(0.62, 0.24, 1);
  lightPool.renderOrder = 2;
  candleGroup.add(lightPool);

  const lightHotspot = new THREE.Mesh(track(new THREE.CircleGeometry(1, 28)), lightHotspotMaterial);
  lightHotspot.position.set(0, 0.06, 0.13);
  lightHotspot.scale.set(0.18, 0.08, 1);
  lightHotspot.renderOrder = 3;
  candleGroup.add(lightHotspot);

  const candleShadow = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.08, 0.01)), candleShadowMaterial);
  candleShadow.position.set(0.06, -0.12, 0.15);
  candleShadow.rotation.z = -0.08;
  candleShadow.renderOrder = 4;
  candleGroup.add(candleShadow);

  const candle = new THREE.Mesh(track(new THREE.BoxGeometry(0.2, 0.18, 0.01)), candleMaterial);
  candle.position.set(0, 0.02, 0.18);
  candle.renderOrder = 5;
  candleGroup.add(candle);

  const candleTop = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 0.06, 0.01)), candleTopMaterial);
  candleTop.position.set(0, 0.12, 0.19);
  candleTop.renderOrder = 6;
  candleGroup.add(candleTop);

  const wick = new THREE.Mesh(track(new THREE.BoxGeometry(0.026, 0.08, 0.01)), wickMaterial);
  wick.position.set(0, 0.19, 0.21);
  wick.renderOrder = 7;
  candleGroup.add(wick);

  const flameHalo = new THREE.Mesh(track(createDiamondGeometry(THREE, 0.22, 0.34)), flameHaloMaterial);
  flameHalo.position.set(0, 0.27, 0.22);
  flameHalo.renderOrder = 8;
  candleGroup.add(flameHalo);

  const flame = new THREE.Mesh(track(createDiamondGeometry(THREE, 0.15, 0.26)), flameMaterial);
  flame.position.set(0, 0.26, 0.23);
  flame.renderOrder = 9;
  candleGroup.add(flame);

  const flameCore = new THREE.Mesh(track(createDiamondGeometry(THREE, 0.07, 0.14)), flameCoreMaterial);
  flameCore.position.set(0, 0.26, 0.24);
  flameCore.renderOrder = 10;
  candleGroup.add(flameCore);

  root.add(candleGroup);

  const activeGlow = new THREE.Mesh(track(new THREE.RingGeometry(0.56, 0.66, 32)), activeMaterial);
  activeGlow.scale.set(1.2, 0.66, 1);
  activeGroup.add(activeGlow);

  const rippleA = new THREE.Mesh(track(new THREE.RingGeometry(0.48, 0.56, 36)), rippleMaterial);
  rippleA.scale.set(1.45, 0.82, 1);
  activeGroup.add(rippleA);

  const rippleB = new THREE.Mesh(track(new THREE.RingGeometry(0.74, 0.8, 36)), rippleMaterial.clone());
  track(rippleB.material);
  rippleB.scale.set(1.45, 0.82, 1);
  activeGroup.add(rippleB);
  root.add(activeGroup);

  Object.entries(SEAT_COORDS).forEach(([seatKey, [x, y]]) => {
    const seat = Number(seatKey);
    const chair = new THREE.Mesh(track(new THREE.BoxGeometry(0.98, 0.54, 0.01)), chairMaterial);
    chair.position.set(x, y, -0.1);
    chair.rotation.z = -Math.atan2(x, y) * 0.18;
    root.add(chair);
    seatShadows.set(seat, chair);

    const glow = new THREE.Mesh(track(new THREE.CircleGeometry(0.62, 24)), seatGlowMaterial.clone());
    track(glow.material);
    glow.position.set(x * 0.88, y * 0.82, 0.15);
    glow.scale.set(0.92, 0.42, 1);
    root.add(glow);
    seatGlows.set(seat, glow);
  });

  for (let index = 0; index < 6; index += 1) {
    const puff = new THREE.Mesh(track(new THREE.CircleGeometry(0.18 + index * 0.024, 16)), smokeMaterial.clone());
    track(puff.material);
    puff.position.set((index - 2.5) * 0.1, 0.58 + index * 0.14, 0.3);
    puff.renderOrder = 11;
    root.add(puff);
    smokePuffs.push(puff);
  }

  const nightPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(10, 10)), nightMaterial);
  nightOverlay.add(nightPlane);
  root.add(nightOverlay);

  const tick = (elapsed: number, state: BackdropState) => {
    const activeSeat = state.players.find((player) => player.id === state.activeSpeakerId)?.seat;
    const busyPulse = state.busy ? 0.025 : 0.012;
    const pausedMultiplier = state.paused ? 0 : 1;

    const flicker = Math.sin(elapsed * 6.4) * 0.5 + Math.sin(elapsed * 11.8 + 0.8) * 0.25;
    const lightPulse = flicker * pausedMultiplier;

    innerGlow.material.opacity = state.phase === "night" ? 0.065 : 0.08;
    nightMaterial.opacity = state.phase === "night" ? 0.22 : 0;
    lightPool.scale.set(0.62 + lightPulse * 0.032, 0.24 + lightPulse * 0.012, 1);
    lightPool.material.opacity = (state.phase === "night" ? 0.085 : 0.065) + lightPulse * 0.014;
    lightHotspot.scale.set(0.18 + lightPulse * 0.01, 0.08 + lightPulse * 0.005, 1);
    lightHotspot.material.opacity = (state.phase === "night" ? 0.16 : 0.12) + lightPulse * 0.018;
    flameHalo.scale.set(1 + lightPulse * 0.09, 1 + lightPulse * 0.12, 1);
    flameHalo.material.opacity = (state.phase === "night" ? 0.28 : 0.22) + lightPulse * 0.045;
    flame.scale.set(1 + lightPulse * 0.05, 1 + lightPulse * 0.1, 1);
    flame.material.opacity = 0.78 + lightPulse * 0.1;
    flameCore.scale.set(1 + lightPulse * 0.03, 1 + lightPulse * 0.07, 1);
    flameCore.material.opacity = 0.88 + lightPulse * 0.08;

    state.players.forEach((player) => {
      const glow = seatGlows.get(player.seat);
      const shadow = seatShadows.get(player.seat);
      if (!glow || !shadow) {
        return;
      }

      const isActive = player.seat === activeSeat;
      glow.material.opacity = player.alive ? (isActive ? 0.09 + Math.sin(elapsed * 4.1) * busyPulse : 0.035) : 0.015;
      shadow.material.opacity = player.alive ? 0.84 : deadSeatMaterial.opacity;
      shadow.material.color.setHex(player.alive ? 0x070504 : 0x050404);
    });

    if (activeSeat === undefined) {
      activeGroup.visible = false;
    } else {
      const [x, y] = SEAT_COORDS[activeSeat] ?? [0, 0];
      activeGroup.visible = true;
      activeGroup.position.set(x * 0.78, y * 0.72, 0.28);
      activeGroup.scale.setScalar(1 + Math.sin(elapsed * 3.2) * (state.busy ? 0.045 : 0.022) * pausedMultiplier);
      activeGlow.material.opacity = 0.09 + Math.sin(elapsed * 4.4) * 0.025 * pausedMultiplier;
      rippleA.material.opacity = 0.08 + Math.sin(elapsed * 5.4) * 0.035 * pausedMultiplier;
      rippleB.material.opacity = 0.055 + Math.sin(elapsed * 4.2 + 1.4) * 0.025 * pausedMultiplier;
    }

    smokePuffs.forEach((puff, index) => {
      puff.position.y = 0.58 + index * 0.14 + Math.sin(elapsed * 0.8 + index) * 0.035 * pausedMultiplier;
      puff.position.x = (index - 2.5) * 0.1 + Math.sin(elapsed * 0.55 + index * 0.7) * 0.04 * pausedMultiplier;
      const material = Array.isArray(puff.material) ? puff.material[0] : puff.material;
      material.opacity = state.phase === "night" ? 0.08 : 0.052;
    });
  };

  return {
    tick,
    dispose: () => {
      scene.remove(root);
      disposeAll();
    }
  };
}

function createDiamondGeometry(THREE: typeof import("three"), width: number, height: number) {
  const shape = new THREE.Shape();
  shape.moveTo(0, height / 2);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, -height / 2);
  shape.lineTo(-width / 2, 0);
  shape.lineTo(0, height / 2);
  return new THREE.ShapeGeometry(shape);
}
