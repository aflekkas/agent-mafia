"use client";

import { useEffect, useRef } from "react";
import { createPixelatedRenderer, type Disposable } from "./pixel-three";

type ThreeModule = typeof import("three");

const STUCCO_COLORS = [0x241910, 0x2a1b12, 0x302013, 0x211710, 0x2a2217];
const ROOF_COLOR = 0x7b2d18;
const SAIL_COLOR = 0x7e6845;
const LAMP_COLOR = 0xf1aa47;

export function HomeTownBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let disposed = false;
    let frameId = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let camera: import("three").PerspectiveCamera | null = null;
    let scene: import("three").Scene | null = null;
    let disposeTown: (() => void) | null = null;
    let renderStatic: (() => void) | null = null;
    let tickTown: ((elapsed: number) => void) | null = null;
    let resizeRenderer: ((camera: import("three").PerspectiveCamera) => void) | null = null;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0
    };

    let updateSize = () => {
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

      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const start = async () => {
      try {
        const THREE = await import("three");
        if (disposed || !mountRef.current) {
          return;
        }

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x030506, 0.035);

        camera = new THREE.PerspectiveCamera(43, 1, 0.1, 90);
        camera.position.set(0, 4.05, 13.6);

        const pixelRenderer = createPixelatedRenderer({
          THREE,
          mount,
          className: "home-town-canvas",
          pixelScale: 3
        });
        renderer = pixelRenderer.renderer;
        resizeRenderer = pixelRenderer.resize;

        const town = buildTownScene(THREE, scene);
        disposeTown = town.dispose;
        tickTown = town.tick;

        renderStatic = () => {
          if (renderer && scene && camera) {
            camera.lookAt(0, 1.45, -9.5);
            renderer.render(scene, camera);
          }
        };

        updateSize();
        window.addEventListener("resize", updateSize);
        window.addEventListener("pointermove", handlePointerMove, { passive: true });

        if (motionQuery.matches) {
          renderStatic();
          return;
        }

        const animate = (time: number) => {
          if (disposed || !renderer || !camera || !scene) {
            return;
          }

          const elapsed = time * 0.001;
          pointer.x += (pointer.targetX - pointer.x) * 0.035;
          pointer.y += (pointer.targetY - pointer.y) * 0.035;

          camera.position.x = pointer.x * 0.82;
          camera.position.y = 4.05 - pointer.y * 0.14;
          camera.position.z = 13.6 + Math.abs(pointer.x) * 0.2;
          camera.lookAt(pointer.x * 0.98, 1.45 - pointer.y * 0.16, -9.5);

          tickTown?.(elapsed);
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
      disposeTown?.();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="home-town-background" aria-hidden="true" />;
}

function buildTownScene(THREE: ThreeModule, scene: import("three").Scene) {
  const disposables: Disposable[] = [];
  const lampLights: import("three").PointLight[] = [];
  const glowSprites: import("three").Sprite[] = [];
  const reflectionStrips: Array<import("three").Mesh<import("three").BufferGeometry, import("three").MeshBasicMaterial>> = [];
  const boatGroup = new THREE.Group();
  const townGroup = new THREE.Group();
  townGroup.name = "home-noir-fishing-village";
  scene.add(townGroup);

  const track = <T extends Disposable>(item: T) => {
    disposables.push(item);
    return item;
  };

  const stuccoMaterials = STUCCO_COLORS.map((color) =>
    track(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.86
      })
    )
  );
  const roofMaterial = track(new THREE.MeshBasicMaterial({ color: ROOF_COLOR, transparent: true, opacity: 0.82 }));
  const sailMaterial = track(
    new THREE.MeshBasicMaterial({
      color: SAIL_COLOR,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    })
  );
  const stoneMaterial = track(new THREE.MeshBasicMaterial({ color: 0x14100d, transparent: true, opacity: 0.74 }));
  const waterMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0x031014,
      transparent: true,
      opacity: 0.68
    })
  );
  const windowMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xf2b866,
      transparent: true,
      opacity: 0.48,
      depthWrite: false
    })
  );
  const lampMaterial = track(new THREE.MeshBasicMaterial({ color: LAMP_COLOR }));
  const postMaterial = track(new THREE.MeshBasicMaterial({ color: 0x17100c }));
  const shadowMaterial = track(new THREE.MeshBasicMaterial({ color: 0x020101 }));
  const moonMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0x9aa4b8,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  );
  const reflectionMaterial = track(
    new THREE.MeshBasicMaterial({
      color: LAMP_COLOR,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  const glowTexture = track(createGlowTexture(THREE));
  const glowMaterial = track(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: LAMP_COLOR,
      transparent: true,
      opacity: 0.31,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );

  const ambient = new THREE.HemisphereLight(0x1c1914, 0x010304, 0.68);
  scene.add(ambient);

  const moonLight = new THREE.DirectionalLight(0x71829e, 0.52);
  moonLight.position.set(-8, 12, 8);
  scene.add(moonLight);

  addMoon(THREE, townGroup, moonMaterial, track);
  addHarbor(THREE, townGroup, waterMaterial, stoneMaterial, reflectionMaterial, reflectionStrips, track);
  addVillageHouses(THREE, townGroup, stuccoMaterials, roofMaterial, windowMaterial, track);
  addLamps(THREE, townGroup, postMaterial, lampMaterial, glowMaterial, lampLights, glowSprites, track);
  addBoats(THREE, townGroup, boatGroup, shadowMaterial, sailMaterial, track);
  addShadowFigure(THREE, townGroup, shadowMaterial, track);

  const tick = (elapsed: number) => {
    townGroup.rotation.y = Math.sin(elapsed * 0.07) * 0.008;
    boatGroup.position.y = Math.sin(elapsed * 0.72) * 0.035;
    boatGroup.rotation.z = Math.sin(elapsed * 0.55) * 0.012;

    lampLights.forEach((light, index) => {
      light.intensity = (index < 2 ? 2.12 : 1.36) + Math.sin(elapsed * (1.45 + index * 0.12) + index) * 0.1;
    });
    glowSprites.forEach((sprite, index) => {
      const pulse = 1 + Math.sin(elapsed * (1.18 + index * 0.08) + index * 1.6) * 0.035;
      sprite.scale.setScalar((index < 2 ? 2.4 : 1.75) * pulse);
    });
    reflectionStrips.forEach((strip, index) => {
      strip.scale.y = 1 + Math.sin(elapsed * (0.95 + index * 0.08) + index) * 0.08;
      const opacity = 0.1 + Math.sin(elapsed * (1.1 + index * 0.06) + index) * 0.035;
      const materials = Array.isArray(strip.material) ? strip.material : [strip.material];
      materials.forEach((material) => {
        material.opacity = opacity;
      });
    });
  };

  return {
    tick,
    dispose: () => {
      scene.remove(townGroup);
      scene.remove(ambient);
      scene.remove(moonLight);
      disposables.forEach((item) => item.dispose());
    }
  };
}

function addMoon(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  material: import("three").Material,
  track: <T extends Disposable>(item: T) => T
) {
  const moon = new THREE.Mesh(track(new THREE.CircleGeometry(1.08, 32)), material);
  moon.position.set(-7.4, 7.15, -20);
  townGroup.add(moon);
}

function addHarbor(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  waterMaterial: import("three").Material,
  stoneMaterial: import("three").Material,
  reflectionMaterial: import("three").MeshBasicMaterial,
  reflectionStrips: Array<import("three").Mesh<import("three").BufferGeometry, import("three").MeshBasicMaterial>>,
  track: <T extends Disposable>(item: T) => T
) {
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(38, 34)), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.08, -4.8);
  townGroup.add(water);

  const quay = new THREE.Mesh(track(new THREE.PlaneGeometry(11.2, 22)), stoneMaterial);
  quay.rotation.x = -Math.PI / 2;
  quay.position.set(0, 0.018, -9.6);
  townGroup.add(quay);

  const pierGeometry = track(new THREE.BoxGeometry(1.1, 0.16, 14));
  [-3.2, 3.2].forEach((x) => {
    const pier = new THREE.Mesh(pierGeometry, stoneMaterial);
    pier.position.set(x, 0.05, -4.2);
    townGroup.add(pier);
  });

  const reflectionGeometry = track(new THREE.PlaneGeometry(0.22, 2.2));
  [
    [-4.1, 0.012, 0.5],
    [4.05, 0.012, -0.8],
    [-2.2, 0.012, -3.2],
    [2.35, 0.012, -4.7],
    [0.6, 0.012, -6.1]
  ].forEach(([x, y, z], index) => {
    const strip = new THREE.Mesh(reflectionGeometry, reflectionMaterial.clone());
    track(strip.material);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, y, z);
    strip.scale.set(1, index < 2 ? 1.45 : 1, 1);
    townGroup.add(strip);
    reflectionStrips.push(strip);
  });
}

function addVillageHouses(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  stuccoMaterials: import("three").Material[],
  roofMaterial: import("three").Material,
  windowMaterial: import("three").Material,
  track: <T extends Disposable>(item: T) => T
) {
  const housePlans = [
    { x: -7.1, y: 1.08, z: -5.7, w: 2.1, h: 2.15, d: 1.9 },
    { x: -5.15, y: 1.36, z: -7.8, w: 2.6, h: 2.7, d: 2.0 },
    { x: -7.75, y: 1.95, z: -10.2, w: 2.2, h: 3.0, d: 2.1 },
    { x: -5.45, y: 2.28, z: -12.1, w: 2.4, h: 3.25, d: 2.0 },
    { x: -8.25, y: 2.82, z: -14.6, w: 2.8, h: 3.55, d: 2.3 },
    { x: 7.05, y: 1.05, z: -5.9, w: 2.2, h: 2.1, d: 1.9 },
    { x: 5.0, y: 1.42, z: -8.4, w: 2.5, h: 2.75, d: 2.1 },
    { x: 7.45, y: 1.94, z: -11.0, w: 2.2, h: 3.05, d: 2.0 },
    { x: 5.55, y: 2.34, z: -13.1, w: 2.7, h: 3.25, d: 2.2 },
    { x: 8.25, y: 2.84, z: -15.7, w: 2.6, h: 3.6, d: 2.3 },
    { x: -2.8, y: 2.76, z: -17.5, w: 2.2, h: 3.0, d: 1.8 },
    { x: 0, y: 3.12, z: -18.5, w: 2.8, h: 3.4, d: 2.1 },
    { x: 2.95, y: 2.76, z: -17.45, w: 2.25, h: 2.9, d: 1.8 }
  ];

  const windowGeometry = track(new THREE.PlaneGeometry(0.26, 0.36));
  const shutterGeometry = track(new THREE.PlaneGeometry(0.08, 0.42));
  const roofGeometry = track(new THREE.BoxGeometry(1, 0.24, 1));
  const shutterMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0x0b1516,
      transparent: true,
      opacity: 0.72
    })
  );

  housePlans.forEach((plan, index) => {
    const visualX = plan.x * 0.72;
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(plan.w, plan.h, plan.d)), stuccoMaterials[index % stuccoMaterials.length]);
    body.position.set(visualX, plan.y, plan.z);
    townGroup.add(body);

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(visualX, plan.y + plan.h / 2 + 0.15, plan.z);
    roof.scale.set(plan.w * 1.16, 1, plan.d * 1.12);
    roof.rotation.z = plan.x < 0 ? -0.08 : 0.08;
    townGroup.add(roof);

    const frontZ = plan.z + plan.d / 2 + 0.006;
    const rows = Math.max(1, Math.floor(plan.h / 1.05));
    const columns = Math.max(1, Math.floor(plan.w / 0.82));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if ((row * 2 + column + index) % 4 === 0) {
          continue;
        }

        const localX = visualX - plan.w / 2 + 0.48 + column * 0.76;
        const localY = plan.y - plan.h / 2 + 0.68 + row * 0.92;
        const window = new THREE.Mesh(windowGeometry, windowMaterial);
        window.position.set(localX, localY, frontZ);
        townGroup.add(window);

        [-1, 1].forEach((side) => {
          const shutter = new THREE.Mesh(shutterGeometry, shutterMaterial);
          shutter.position.set(localX + side * 0.2, localY, frontZ + 0.002);
          townGroup.add(shutter);
        });
      }
    }
  });
}

function addLamps(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  postMaterial: import("three").Material,
  lampMaterial: import("three").Material,
  glowMaterial: import("three").SpriteMaterial,
  lampLights: import("three").PointLight[],
  glowSprites: import("three").Sprite[],
  track: <T extends Disposable>(item: T) => T
) {
  const lampPostGeometry = track(new THREE.CylinderGeometry(0.04, 0.06, 1.7, 8));
  const lampHeadGeometry = track(new THREE.SphereGeometry(0.16, 14, 8));
  const lampCapGeometry = track(new THREE.ConeGeometry(0.22, 0.2, 8));

  [
    [-4.3, 0.85, -0.25],
    [4.3, 0.85, -1.4],
    [-4.15, 0.85, -5.2],
    [4.1, 0.85, -6.8],
    [-1.7, 0.85, -10.1],
    [1.7, 0.85, -11.0]
  ].forEach(([x, y, z], index) => {
    const post = new THREE.Mesh(lampPostGeometry, postMaterial);
    post.position.set(x, y, z);
    townGroup.add(post);

    const head = new THREE.Mesh(lampHeadGeometry, lampMaterial);
    head.position.set(x, y + 0.88, z);
    townGroup.add(head);

    const cap = new THREE.Mesh(lampCapGeometry, postMaterial);
    cap.position.set(x, y + 1.08, z);
    townGroup.add(cap);

    const light = new THREE.PointLight(LAMP_COLOR, index < 2 ? 2.35 : 1.42, 7.3, 2.15);
    light.position.copy(head.position);
    townGroup.add(light);
    lampLights.push(light);

    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(head.position);
    glow.scale.set(index < 2 ? 2.4 : 1.75, index < 2 ? 2.4 : 1.75, 1);
    townGroup.add(glow);
    glowSprites.push(glow);
  });
}

function addBoats(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  boatGroup: import("three").Group,
  hullMaterial: import("three").Material,
  sailMaterial: import("three").Material,
  track: <T extends Disposable>(item: T) => T
) {
  const hullGeometry = track(new THREE.CylinderGeometry(0.34, 0.52, 1.65, 6));
  const mastGeometry = track(new THREE.CylinderGeometry(0.025, 0.03, 1.62, 6));
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, -0.58);
  sailShape.lineTo(0.72, -0.18);
  sailShape.lineTo(0, 0.72);
  sailShape.lineTo(0, -0.58);
  const sailGeometry = track(new THREE.ShapeGeometry(sailShape));

  [
    [-4.35, -0.04, 0.75, -0.28],
    [4.4, -0.05, -0.55, 0.28],
    [0.2, -0.06, -4.95, -0.08]
  ].forEach(([x, y, z, rotation], index) => {
    const boat = new THREE.Group();
    boat.position.set(x, y, z);
    boat.rotation.y = rotation;

    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(index === 2 ? 0.7 : 1, 0.7, 0.58);
    boat.add(hull);

    const mast = new THREE.Mesh(mastGeometry, hullMaterial);
    mast.position.set(0, 0.58, 0);
    boat.add(mast);

    if (index !== 2) {
      const sail = new THREE.Mesh(sailGeometry, sailMaterial);
      sail.position.set(0.06, 0.94, 0);
      sail.rotation.y = -0.2;
      sail.scale.set(1.05, 1.08, 1);
      boat.add(sail);
    }

    boatGroup.add(boat);
  });

  townGroup.add(boatGroup);
}

function addShadowFigure(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  material: import("three").Material,
  track: <T extends Disposable>(item: T) => T
) {
  const figure = new THREE.Group();
  figure.position.set(3.45, 0.04, -6.2);
  figure.rotation.y = -0.24;

  const coatGeometry = track(new THREE.CylinderGeometry(0.3, 0.44, 1.42, 7));
  const headGeometry = track(new THREE.SphereGeometry(0.2, 12, 8));
  const hatBrimGeometry = track(new THREE.BoxGeometry(0.64, 0.05, 0.24));
  const hatTopGeometry = track(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 7));

  const coat = new THREE.Mesh(coatGeometry, material);
  coat.position.set(0, 0.72, 0);
  figure.add(coat);

  const head = new THREE.Mesh(headGeometry, material);
  head.position.set(0, 1.52, 0);
  figure.add(head);

  const brim = new THREE.Mesh(hatBrimGeometry, material);
  brim.position.set(0, 1.74, 0);
  figure.add(brim);

  const hatTop = new THREE.Mesh(hatTopGeometry, material);
  hatTop.position.set(0, 1.88, 0);
  figure.add(hatTop);

  townGroup.add(figure);
}

function createGlowTexture(THREE: ThreeModule) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
    gradient.addColorStop(0, "rgba(255, 226, 151, 0.92)");
    gradient.addColorStop(0.22, "rgba(241, 170, 71, 0.42)");
    gradient.addColorStop(0.62, "rgba(174, 68, 26, 0.12)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
