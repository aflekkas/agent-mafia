type ThreeModule = typeof import("three");

export type Disposable = { dispose: () => void };

export function createDisposableTracker() {
  const disposables: Disposable[] = [];

  return {
    track<T extends Disposable>(item: T) {
      disposables.push(item);
      return item;
    },
    disposeAll() {
      disposables.forEach((item) => item.dispose());
    }
  };
}

export function createPixelatedRenderer({
  THREE,
  mount,
  className,
  pixelScale = 3
}: {
  THREE: ThreeModule;
  mount: HTMLElement;
  className: string;
  pixelScale?: number;
}) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    powerPreference: "high-performance"
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.domElement.className = className;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.imageRendering = "pixelated";
  mount.appendChild(renderer.domElement);

  const resize = (camera: import("three").PerspectiveCamera | import("three").OrthographicCamera) => {
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    const renderWidth = Math.max(1, Math.floor(width / pixelScale));
    const renderHeight = Math.max(1, Math.floor(height / pixelScale));

    renderer.setSize(renderWidth, renderHeight, false);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;

    if ("aspect" in camera) {
      camera.aspect = width / height;
    } else {
      const aspect = width / height;
      camera.left = -aspect * 5;
      camera.right = aspect * 5;
      camera.top = 5;
      camera.bottom = -5;
    }
    camera.updateProjectionMatrix();
  };

  return { renderer, resize };
}
