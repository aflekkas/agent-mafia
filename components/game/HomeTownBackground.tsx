"use client";

import { useEffect, useRef } from "react";

type ThreeModule = typeof import("three");
type Disposable = { dispose: () => void };

const BUILDING_COLOR = 0x070504;
const BUILDING_EDGE_COLOR = 0x14100d;
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

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0
    };

    const updateSize = () => {
      if (!renderer || !camera) {
        return;
      }

      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
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
        scene.fog = new THREE.FogExp2(0x050302, 0.032);

        camera = new THREE.PerspectiveCamera(43, 1, 0.1, 90);
        camera.position.set(0, 4.2, 12.8);

        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance"
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.className = "home-town-canvas";
        renderer.domElement.setAttribute("aria-hidden", "true");
        mount.appendChild(renderer.domElement);

        const town = buildTownScene(THREE, scene);
        disposeTown = town.dispose;
        tickTown = town.tick;

        renderStatic = () => {
          if (renderer && scene && camera) {
            camera.lookAt(0, 1.7, -11);
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

          camera.position.x = pointer.x * 0.72;
          camera.position.y = 4.2 - pointer.y * 0.16;
          camera.position.z = 12.8 + Math.abs(pointer.x) * 0.22;
          camera.lookAt(pointer.x * 0.95, 1.65 - pointer.y * 0.18, -12);

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
  const townGroup = new THREE.Group();
  townGroup.name = "home-noir-town";
  scene.add(townGroup);

  const track = <T extends Disposable>(item: T) => {
    disposables.push(item);
    return item;
  };

  const buildingMaterial = track(
    new THREE.MeshStandardMaterial({
      color: BUILDING_COLOR,
      roughness: 0.96,
      metalness: 0.02
    })
  );
  const edgeMaterial = track(new THREE.MeshBasicMaterial({ color: BUILDING_EDGE_COLOR }));
  const windowMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0xf2b866,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
  );
  const shadowMaterial = track(new THREE.MeshBasicMaterial({ color: 0x020101 }));
  const lampMaterial = track(new THREE.MeshBasicMaterial({ color: LAMP_COLOR }));
  const roadMaterial = track(
    new THREE.MeshStandardMaterial({
      color: 0x050403,
      roughness: 0.68,
      metalness: 0.18
    })
  );
  const curbMaterial = track(new THREE.MeshStandardMaterial({ color: 0x100c09, roughness: 0.9 }));
  const glowTexture = track(createGlowTexture(THREE));
  const glowMaterial = track(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: LAMP_COLOR,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );

  const ambient = new THREE.HemisphereLight(0x1d1712, 0x020101, 0.62);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x6f7d9a, 0.48);
  moon.position.set(-6, 12, 7);
  scene.add(moon);

  const roadGeometry = track(new THREE.PlaneGeometry(10.5, 62));
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.04, -18);
  townGroup.add(road);

  const centerLineGeometry = track(new THREE.PlaneGeometry(0.08, 2.4));
  const centerLineMaterial = track(
    new THREE.MeshBasicMaterial({
      color: 0x5b4430,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  );
  for (let i = 0; i < 13; i += 1) {
    const stripe = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.006, 4 - i * 4.2);
    townGroup.add(stripe);
  }

  const curbGeometry = track(new THREE.BoxGeometry(0.22, 0.16, 62));
  [-5.45, 5.45].forEach((x) => {
    const curb = new THREE.Mesh(curbGeometry, curbMaterial);
    curb.position.set(x, 0.04, -18);
    townGroup.add(curb);
  });

  addBuildings(THREE, townGroup, {
    side: -1,
    buildingMaterial,
    edgeMaterial,
    windowMaterial,
    track
  });
  addBuildings(THREE, townGroup, {
    side: 1,
    buildingMaterial,
    edgeMaterial,
    windowMaterial,
    track
  });

  const lampPostGeometry = track(new THREE.CylinderGeometry(0.045, 0.065, 2.25, 8));
  const lampArmGeometry = track(new THREE.BoxGeometry(0.9, 0.06, 0.06));
  const lampHeadGeometry = track(new THREE.SphereGeometry(0.18, 14, 8));
  const lampPostMaterial = track(new THREE.MeshBasicMaterial({ color: 0x19130e }));

  [
    [-4.75, 0.95, 0.2],
    [4.75, 0.95, -3.7],
    [-4.75, 0.95, -8.3],
    [4.75, 0.95, -13.4],
    [-4.75, 0.95, -19.6],
    [4.75, 0.95, -26.2]
  ].forEach(([x, y, z], index) => {
    const post = new THREE.Mesh(lampPostGeometry, lampPostMaterial);
    post.position.set(x, y, z);
    townGroup.add(post);

    const arm = new THREE.Mesh(lampArmGeometry, lampPostMaterial);
    arm.position.set(x + (x < 0 ? 0.42 : -0.42), y + 1.05, z);
    townGroup.add(arm);

    const head = new THREE.Mesh(lampHeadGeometry, lampMaterial);
    head.position.set(x + (x < 0 ? 0.84 : -0.84), y + 1.05, z);
    townGroup.add(head);

    const light = new THREE.PointLight(LAMP_COLOR, index < 2 ? 2.5 : 1.55, 7.5, 2.2);
    light.position.copy(head.position);
    townGroup.add(light);
    lampLights.push(light);

    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(head.position);
    glow.scale.set(index < 2 ? 2.55 : 1.95, index < 2 ? 2.55 : 1.95, 1);
    townGroup.add(glow);
    glowSprites.push(glow);
  });

  addShadowFigure(THREE, townGroup, shadowMaterial, track);

  const tick = (elapsed: number) => {
    townGroup.rotation.y = Math.sin(elapsed * 0.08) * 0.008;
    lampLights.forEach((light, index) => {
      light.intensity = (index < 2 ? 2.25 : 1.4) + Math.sin(elapsed * (1.6 + index * 0.11) + index) * 0.12;
    });
    glowSprites.forEach((sprite, index) => {
      const pulse = 1 + Math.sin(elapsed * (1.35 + index * 0.08) + index * 1.7) * 0.035;
      sprite.scale.setScalar((index < 2 ? 2.55 : 1.95) * pulse);
    });
  };

  return {
    tick,
    dispose: () => {
      scene.remove(townGroup);
      scene.remove(ambient);
      scene.remove(moon);
      disposables.forEach((item) => item.dispose());
    }
  };
}

function addBuildings(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  options: {
    side: -1 | 1;
    buildingMaterial: import("three").Material;
    edgeMaterial: import("three").Material;
    windowMaterial: import("three").Material;
    track: <T extends Disposable>(item: T) => T;
  }
) {
  const depths = [4.4, 5.2, 3.6, 6.1, 4.8, 5.8, 4.2, 6.4];
  const heights = [5.8, 7.4, 4.6, 8.8, 6.5, 7.9, 5.2, 9.2];
  const widths = [2.8, 3.2, 2.6, 3.5, 3.1, 2.9, 3.4, 3.0];
  const windowGeometry = options.track(new THREE.PlaneGeometry(0.28, 0.38));
  const ledgeGeometry = options.track(new THREE.BoxGeometry(0.04, 6.8, 0.04));

  let z = 1.2;
  depths.forEach((depth, index) => {
    const width = widths[index];
    const height = heights[index];
    const x = options.side * (6.7 + (index % 2) * 0.55);
    const buildingGeometry = options.track(new THREE.BoxGeometry(width, height, depth));
    const building = new THREE.Mesh(buildingGeometry, options.buildingMaterial);
    building.position.set(x, height / 2 - 0.05, z - depth / 2);
    townGroup.add(building);

    const ledge = new THREE.Mesh(ledgeGeometry, options.edgeMaterial);
    ledge.position.set(options.side * 5.16, height / 2 - 0.1, z - depth / 2);
    townGroup.add(ledge);

    const columns = Math.max(2, Math.floor(width / 0.75));
    const rows = Math.max(2, Math.floor(height / 1.2));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if ((row + column + index) % 3 === 0) {
          continue;
        }

        const window = new THREE.Mesh(windowGeometry, options.windowMaterial);
        window.position.set(
          options.side * 5.05,
          1 + row * 1.03,
          z - depth + 0.6 + column * Math.min(0.7, depth / Math.max(columns, 1))
        );
        window.rotation.y = options.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        townGroup.add(window);
      }
    }

    z -= depth + 0.45;
  });
}

function addShadowFigure(
  THREE: ThreeModule,
  townGroup: import("three").Group,
  material: import("three").Material,
  track: <T extends Disposable>(item: T) => T
) {
  const figure = new THREE.Group();
  figure.position.set(2.65, 0.03, -2.85);
  figure.rotation.y = -0.18;

  const coatGeometry = track(new THREE.CylinderGeometry(0.34, 0.48, 1.55, 7));
  const headGeometry = track(new THREE.SphereGeometry(0.23, 12, 8));
  const hatBrimGeometry = track(new THREE.BoxGeometry(0.72, 0.06, 0.26));
  const hatTopGeometry = track(new THREE.CylinderGeometry(0.19, 0.22, 0.24, 7));

  const coat = new THREE.Mesh(coatGeometry, material);
  coat.position.set(0, 0.78, 0);
  figure.add(coat);

  const head = new THREE.Mesh(headGeometry, material);
  head.position.set(0, 1.68, 0);
  figure.add(head);

  const brim = new THREE.Mesh(hatBrimGeometry, material);
  brim.position.set(0, 1.92, 0);
  figure.add(brim);

  const hatTop = new THREE.Mesh(hatTopGeometry, material);
  hatTop.position.set(0, 2.06, 0);
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
