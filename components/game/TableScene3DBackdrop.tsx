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

type TablePropSlot = [number, number, number];

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
          pixelScale: 3
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
  const propGroup = new THREE.Group();
  const nightOverlay = new THREE.Group();
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
  const propShadowMaterial = track(new THREE.MeshBasicMaterial({ color: 0x050302, transparent: true, opacity: 0.38, depthWrite: false }));
  const cardMaterial = track(new THREE.MeshBasicMaterial({ color: 0xd8cab4, transparent: true, opacity: 0.86, depthWrite: false }));
  const cardBackMaterial = track(new THREE.MeshBasicMaterial({ color: 0x3d1718, transparent: true, opacity: 0.9, depthWrite: false }));
  const cardRedMaterial = track(new THREE.MeshBasicMaterial({ color: 0x7d1b1f, transparent: true, opacity: 0.86, depthWrite: false }));
  const cardBlackMaterial = track(new THREE.MeshBasicMaterial({ color: 0x15100d, transparent: true, opacity: 0.82, depthWrite: false }));
  const chipMaterial = track(new THREE.MeshBasicMaterial({ color: 0xa47738, transparent: true, opacity: 0.72, depthWrite: false }));
  const chipAccentMaterial = track(new THREE.MeshBasicMaterial({ color: 0xead09a, transparent: true, opacity: 0.46, depthWrite: false }));
  const plateMaterial = track(new THREE.MeshBasicMaterial({ color: 0x6f5b42, transparent: true, opacity: 0.42, depthWrite: false }));
  const breadMaterial = track(new THREE.MeshBasicMaterial({ color: 0xb57938, transparent: true, opacity: 0.7, depthWrite: false }));
  const oliveMaterial = track(new THREE.MeshBasicMaterial({ color: 0x2f3a1f, transparent: true, opacity: 0.72, depthWrite: false }));
  const glassMaterial = track(new THREE.MeshBasicMaterial({ color: 0x9eb0a6, transparent: true, opacity: 0.24, depthWrite: false }));
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

  const addBox = (
    group: import("three").Group,
    width: number,
    height: number,
    material: import("three").MeshBasicMaterial,
    x: number,
    y: number,
    z: number,
    rotation = 0
  ) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(width, height, 0.01)), material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rotation;
    mesh.renderOrder = Math.round(z * 100);
    group.add(mesh);
    return mesh;
  };

  const addCircle = (
    group: import("three").Group,
    radius: number,
    material: import("three").MeshBasicMaterial,
    x: number,
    y: number,
    z: number,
    scaleX = 1,
    scaleY = 1
  ) => {
    const mesh = new THREE.Mesh(track(new THREE.CircleGeometry(radius, 18)), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(scaleX, scaleY, 1);
    mesh.renderOrder = Math.round(z * 100);
    group.add(mesh);
    return mesh;
  };

  const addCard = (x: number, y: number, rotation: number, faceUp: boolean) => {
    addBox(propGroup, 0.48, 0.68, propShadowMaterial, x + 0.05, y - 0.05, 0.16, rotation);
    addBox(propGroup, 0.42, 0.6, faceUp ? cardMaterial : cardBackMaterial, x, y, 0.18, rotation);

    if (faceUp) {
      const pipMaterial = Math.random() > 0.5 ? cardRedMaterial : cardBlackMaterial;
      addCircle(propGroup, 0.032, pipMaterial, x - Math.sin(rotation) * 0.14 - Math.cos(rotation) * 0.1, y + Math.cos(rotation) * 0.14 - Math.sin(rotation) * 0.1, 0.2);
      addCircle(propGroup, 0.032, pipMaterial, x + Math.sin(rotation) * 0.14 + Math.cos(rotation) * 0.1, y - Math.cos(rotation) * 0.14 + Math.sin(rotation) * 0.1, 0.2);
    } else {
      addBox(propGroup, 0.23, 0.36, cardRedMaterial, x, y, 0.2, rotation);
    }
  };

  const addChipStack = (x: number, y: number, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const offset = index * 0.035;
      addCircle(propGroup, 0.13, chipMaterial, x + offset, y + offset * 0.45, 0.18 + index * 0.004, 1, 0.72);
      addCircle(propGroup, 0.07, chipAccentMaterial, x + offset, y + offset * 0.45, 0.19 + index * 0.004, 1, 0.72);
    }
  };

  const addPlate = (x: number, y: number, rotation: number) => {
    addCircle(propGroup, 0.34, plateMaterial, x, y, 0.17, 1.28, 0.68);
    addBox(propGroup, 0.38, 0.13, breadMaterial, x - 0.04, y + 0.02, 0.19, rotation);
    addCircle(propGroup, 0.055, oliveMaterial, x + 0.18, y - 0.06, 0.2, 1, 0.8);
    addCircle(propGroup, 0.05, oliveMaterial, x + 0.04, y - 0.08, 0.2, 1, 0.8);
  };

  const addGlass = (x: number, y: number, rotation: number) => {
    addBox(propGroup, 0.18, 0.28, glassMaterial, x, y, 0.19, rotation);
    addCircle(propGroup, 0.09, glassMaterial, x, y + 0.13, 0.2, 1, 0.45);
  };

  const shuffledSlots = shuffle<TablePropSlot>([
    [-1.95, 0.78, -0.34],
    [-1.32, -0.82, 0.28],
    [-0.42, 0.72, -0.08],
    [0.72, -0.7, -0.22],
    [1.38, 0.58, 0.36],
    [2.08, -0.34, -0.18],
    [-2.28, -0.24, 0.2]
  ]);

  shuffledSlots.slice(0, 4).forEach(([x, y, rotation], index) => {
    addCard(x, y, rotation, index % 3 !== 0);
  });
  shuffledSlots.slice(4, 6).forEach(([x, y], index) => {
    addChipStack(x, y, 2 + index);
  });
  const [plateX, plateY, plateRotation] = shuffledSlots[6] ?? [1.84, -0.72, 0.2];
  addPlate(plateX, plateY, plateRotation);
  addGlass(-0.08, -0.48, -0.08);
  addGlass(1.02, 0.18, 0.22);

  root.add(propGroup);

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

  const nightPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(10, 10)), nightMaterial);
  nightOverlay.add(nightPlane);
  root.add(nightOverlay);

  const tick = (_elapsed: number, state: BackdropState) => {
    const activeSeat = state.players.find((player) => player.id === state.activeSpeakerId)?.seat;
    const isNight = state.phase === "night";

    innerGlow.material.opacity = isNight ? 0.065 : 0.08;
    nightMaterial.opacity = isNight ? 0.22 : 0;

    state.players.forEach((player) => {
      const glow = seatGlows.get(player.seat);
      const shadow = seatShadows.get(player.seat);
      if (!glow || !shadow) {
        return;
      }

      const isActive = player.seat === activeSeat;
      glow.material.opacity = player.alive ? (isActive ? 0.09 : 0.035) : 0.015;
      shadow.material.opacity = player.alive ? 0.84 : deadSeatMaterial.opacity;
      shadow.material.color.setHex(player.alive ? 0x070504 : 0x050404);
    });

    if (activeSeat === undefined) {
      activeGroup.visible = false;
    } else {
      const [x, y] = SEAT_COORDS[activeSeat] ?? [0, 0];
      activeGroup.visible = true;
      activeGroup.position.set(x * 0.78, y * 0.72, 0.28);
      activeGroup.scale.setScalar(state.busy ? 1.035 : 1);
      activeGlow.material.opacity = state.busy ? 0.1 : 0.085;
      rippleA.material.opacity = state.busy ? 0.085 : 0.07;
      rippleB.material.opacity = state.busy ? 0.065 : 0.05;
    }
  };

  return {
    tick,
    dispose: () => {
      scene.remove(root);
      disposeAll();
    }
  };
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
