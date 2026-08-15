import * as THREE from "three";
import {
  LANDING_PRESENTATION_PROGRESS,
  captureStageOpacity,
  rangeProgress,
  smoothstep
} from "./landing/progress";

const COLORS = {
  black: 0x050505,
  white: 0xf2f0e8,
  lime: 0xd9ff43,
  coral: 0xff5a4f,
  cobalt: 0x5e78ff,
  dim: 0x575a61
} as const;

const MOBILE_MEDIA_QUERY = "(max-width: 780px)";
const DESKTOP_MAX_FPS = 60;
const MOBILE_MAX_FPS = 30;
const CALLOUT_MAX_FPS = 20;
const PROGRESS_DAMPING_PER_SECOND = 4.68;
const SCENE_HORIZONTAL_FILL = 0.94;
const CAPTURE_DESIGN_WIDTH = 8.3;
const SIGNING_DESIGN_WIDTH = 3.4;
const PRIVACY_DESIGN_WIDTH = 6.2;

type FadableMaterial = THREE.Material & { opacity: number };

export class LandingScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly captureGroup = new THREE.Group();
  private readonly signingGroup = new THREE.Group();
  private readonly privacyGroup = new THREE.Group();
  private readonly cameraRig = new THREE.Group();
  private readonly outputRig = new THREE.Group();
  private readonly subjectRig = new THREE.Group();
  private readonly cameraCalloutTarget = new THREE.Object3D();
  private photoCalloutTarget: THREE.Object3D | null = null;
  private depthCalloutTarget: THREE.Object3D | null = null;
  private readonly packageLayers: THREE.Object3D[] = [];
  private readonly networkNodes: THREE.Object3D[] = [];
  private readonly depthBloom = makePoints(
    new THREE.TorusKnotGeometry(0.74, 0.22, 150, 18, 2, 3),
    COLORS.lime,
    0.022,
    0.82
  );
  private readonly depthTarget = new THREE.WebGLRenderTarget(512, 512, {
    colorSpace: THREE.SRGBColorSpace
  });
  private readonly colorTarget = new THREE.WebGLRenderTarget(512, 512, {
    colorSpace: THREE.SRGBColorSpace
  });
  private readonly captureScene = new THREE.Scene();
  private readonly captureCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 10);
  private readonly depthMaterial = new THREE.MeshDepthMaterial();
  private readonly reducedMotion: boolean;
  private readonly mobileViewport = window.matchMedia(MOBILE_MEDIA_QUERY);
  private readonly calloutProjectionPoint = new THREE.Vector3();
  private resizeObserver: ResizeObserver | null = null;
  private animationFrame = 0;
  private lastRenderTimeMs = 0;
  private lastCalloutTimeMs = 0;
  private calloutsVisible = false;
  private targetProgress = 0;
  private renderedProgress = 0;
  private captureScale = 1;
  private signingScale = 1;
  private privacyScale = 1;
  private active = false;
  private disposed = false;
  private contextLost = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(COLORS.black, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera.position.set(0, 0, 10);
    this.scene.background = new THREE.Color(COLORS.black);
    this.captureScene.background = new THREE.Color(COLORS.black);
    this.captureCamera.position.set(0, 0, 3.8);

    this.buildAmbientField();
    this.buildCaptureStage();
    this.buildSigningStage();
    this.buildPrivacyStage();
    this.scene.add(this.captureGroup, this.signingGroup, this.privacyGroup);

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.renderCaptureTextures();
    this.updateScene(0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  setProgress(progress: number): void {
    this.targetProgress = Math.min(1, Math.max(0, progress));
    if (this.reducedMotion) {
      this.renderedProgress =
        this.targetProgress < 0.34
          ? LANDING_PRESENTATION_PROGRESS.capture
          : this.targetProgress < 0.68
            ? LANDING_PRESENTATION_PROGRESS.sign
            : LANDING_PRESENTATION_PROGRESS.privacy;
      this.updateScene(this.renderedProgress, performance.now() * 0.001);
      this.renderer.render(this.scene, this.camera);
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active && !this.reducedMotion) {
      this.start();
    } else if (!active) {
      this.stop();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.depthTarget.dispose();
    this.colorTarget.dispose();
    this.depthMaterial.dispose();
    disposeObject(this.scene);
    disposeObject(this.captureScene);
    this.renderer.dispose();
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.stop();
    this.canvas.dispatchEvent(new CustomEvent("tapcam:webgl-unavailable", { bubbles: true }));
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.resize();
    this.renderCaptureTextures();
    this.canvas.dispatchEvent(new CustomEvent("tapcam:webgl-restored", { bubbles: true }));
    if (this.active) {
      this.start();
    }
  };

  private start(): void {
    if (this.animationFrame || this.contextLost || this.disposed) {
      return;
    }
    this.lastRenderTimeMs = 0;
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  private readonly tick = (timeMs: number): void => {
    this.animationFrame = 0;
    if (!this.active || this.disposed || this.contextLost) {
      return;
    }

    const maximumFps = this.mobileViewport.matches ? MOBILE_MAX_FPS : DESKTOP_MAX_FPS;
    const minimumFrameDurationMs = 1000 / maximumFps;
    const elapsedMs = this.lastRenderTimeMs > 0
      ? timeMs - this.lastRenderTimeMs
      : minimumFrameDurationMs;
    if (this.lastRenderTimeMs > 0 && elapsedMs < minimumFrameDurationMs - 0.5) {
      this.animationFrame = window.requestAnimationFrame(this.tick);
      return;
    }

    this.lastRenderTimeMs = timeMs;
    const deltaSeconds = Math.min(elapsedMs, 100) / 1000;
    const progressBlend = 1 - Math.exp(-PROGRESS_DAMPING_PER_SECOND * deltaSeconds);
    this.renderedProgress += (this.targetProgress - this.renderedProgress) * progressBlend;
    this.updateScene(this.renderedProgress, timeMs * 0.001);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };

  private resize(): void {
    const host = this.canvas.parentElement;
    const width = Math.max(1, host?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, host?.clientHeight ?? window.innerHeight);
    const isMobile = this.mobileViewport.matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = isMobile ? 49 : 38;
    this.camera.position.z = isMobile ? 15.8 : 10;
    this.camera.updateProjectionMatrix();
    const verticalViewSize =
      2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.camera.position.z;
    const horizontalViewSize = verticalViewSize * this.camera.aspect;
    this.captureScale = sceneScaleForHorizontalFill(
      horizontalViewSize,
      CAPTURE_DESIGN_WIDTH,
      0.74,
      1.35
    );
    this.signingScale = sceneScaleForHorizontalFill(
      horizontalViewSize,
      SIGNING_DESIGN_WIDTH,
      1.75,
      2.75
    );
    this.privacyScale = sceneScaleForHorizontalFill(
      horizontalViewSize,
      PRIVACY_DESIGN_WIDTH,
      0.95,
      1.65
    );
  }

  private renderCaptureTextures(): void {
    this.captureScene.overrideMaterial = null;
    this.renderer.setRenderTarget(this.colorTarget);
    this.renderer.render(this.captureScene, this.captureCamera);
    this.captureScene.overrideMaterial = this.depthMaterial;
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.render(this.captureScene, this.captureCamera);
    this.captureScene.overrideMaterial = null;
    this.renderer.setRenderTarget(null);
  }

  private buildAmbientField(): void {
    const geometry = new THREE.BufferGeometry();
    const pointCount = 850;
    const positions = new Float32Array(pointCount * 3);
    for (let index = 0; index < pointCount; index += 1) {
      const seed = index * 12.9898;
      const x = pseudoRandom(seed) * 18 - 9;
      const y = pseudoRandom(seed + 7.1) * 10 - 5;
      const z = pseudoRandom(seed + 19.7) * 10 - 8;
      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = fadable(
      new THREE.PointsMaterial({ color: COLORS.dim, size: 0.018, transparent: true, opacity: 0.26 })
    );
    const stars = new THREE.Points(geometry, material);
    stars.name = "ambient-field";
    this.scene.add(stars);
  }

  private buildCaptureStage(): void {
    this.cameraRig.add(makeCameraModule(0.06, 0.7, COLORS.white, COLORS.lime));
    this.cameraRig.add(makeCameraModule(-0.08, -0.72, COLORS.white, COLORS.cobalt));
    this.cameraRig.position.set(0.2, 0, 0);

    const subjectGeometry = new THREE.TorusKnotGeometry(0.78, 0.26, 180, 20, 2, 3);
    const subjectPoints = makePoints(subjectGeometry.clone(), COLORS.white, 0.027, 0.94);
    const subjectAccent = makePoints(
      new THREE.IcosahedronGeometry(0.38, 3),
      COLORS.lime,
      0.024,
      0.9
    );
    subjectAccent.position.set(0.05, 0.05, 0.05);
    this.subjectRig.add(subjectPoints, subjectAccent);
    this.subjectRig.position.set(3.15, 0, 0);
    this.subjectRig.scale.setScalar(1.18);

    const captureSubject = new THREE.Mesh(
      subjectGeometry.clone(),
      new THREE.MeshNormalMaterial({ flatShading: true })
    );
    captureSubject.rotation.set(0.2, 0.5, 0.1);
    this.captureScene.add(captureSubject);
    subjectGeometry.dispose();

    const photoPlane = makeOutputPlane(this.colorTarget.texture, COLORS.white);
    photoPlane.position.set(-3.05, 0.82, 0.05);
    photoPlane.rotation.y = 0.22;
    photoPlane.userData.baseY = 0.82;
    const depthPlane = makeOutputPlane(this.depthTarget.texture, COLORS.lime);
    depthPlane.position.set(-3.35, -0.82, -0.25);
    depthPlane.rotation.y = 0.22;
    depthPlane.userData.baseY = -0.82;
    this.depthBloom.position.set(-2.2, -0.7, 0.18);
    this.depthBloom.scale.set(0.05, 0.05, 0.001);
    this.photoCalloutTarget = photoPlane;
    this.depthCalloutTarget = depthPlane;
    this.cameraCalloutTarget.position.set(0.34, 0.72, 0);
    this.cameraRig.add(this.cameraCalloutTarget);
    this.outputRig.add(photoPlane, depthPlane, this.depthBloom);

    this.captureGroup.add(this.outputRig, this.cameraRig, this.subjectRig);
    this.captureGroup.add(
      makeConnectionLine(new THREE.Vector3(-2.25, 0.4, 0), new THREE.Vector3(-0.45, 0.4, 0), COLORS.white),
      makeConnectionLine(new THREE.Vector3(-2.35, -0.45, -0.1), new THREE.Vector3(-0.45, -0.45, -0.1), COLORS.lime),
      makeConnectionLine(new THREE.Vector3(0.72, 0.45, 0), new THREE.Vector3(2.3, 0.3, 0), COLORS.coral),
      makeConnectionLine(new THREE.Vector3(0.72, -0.45, 0), new THREE.Vector3(2.3, -0.3, 0), COLORS.cobalt)
    );
  }

  private buildSigningStage(): void {
    const definitions = [
      { color: COLORS.white, x: -2.25 },
      { color: COLORS.lime, x: -0.75 },
      { color: COLORS.cobalt, x: 0.75 },
      { color: COLORS.coral, x: 2.25 }
    ];
    for (const [index, definition] of definitions.entries()) {
      const geometry = new THREE.BoxGeometry(1.05, 1.62, 0.12, 14, 18, 1);
      const slab = makePoints(geometry, definition.color, 0.026, 0.98);
      slab.position.set(definition.x, 0, (index - 1.5) * 0.38);
      slab.rotation.y = -0.24 + index * 0.16;
      slab.userData.baseX = definition.x;
      slab.userData.baseZ = (index - 1.5) * 0.38;
      this.packageLayers.push(slab);
      this.signingGroup.add(slab);
    }

    const signatureRing = makePoints(
      new THREE.TorusGeometry(1.26, 0.055, 8, 180),
      COLORS.lime,
      0.036,
      1
    );
    signatureRing.name = "signature-ring";
    signatureRing.rotation.x = Math.PI / 2;
    signatureRing.scale.setScalar(0.001);
    this.signingGroup.add(signatureRing);

    const sealCore = makePoints(new THREE.IcosahedronGeometry(0.5, 4), COLORS.white, 0.026, 1);
    sealCore.name = "seal-core";
    sealCore.scale.setScalar(0.001);
    this.signingGroup.add(sealCore);

    const scanGeometry = new THREE.BoxGeometry(0.035, 2.25, 0.035);
    const scanMaterial = fadable(
      new THREE.MeshBasicMaterial({ color: COLORS.coral, transparent: true, opacity: 0.85 })
    );
    const scanLine = new THREE.Mesh(scanGeometry, scanMaterial);
    scanLine.name = "signature-scan";
    scanLine.position.x = -2.8;
    this.signingGroup.add(scanLine);
    this.signingGroup.position.z = 0.15;
  }

  private buildPrivacyStage(): void {
    const core = makePoints(new THREE.BoxGeometry(1.15, 1.52, 1.15, 14, 18, 14), COLORS.white, 0.025, 0.95);
    core.name = "proof-core";
    this.privacyGroup.add(core);

    const shell = makePoints(new THREE.IcosahedronGeometry(2.05, 5), COLORS.lime, 0.018, 0.7);
    shell.name = "privacy-shell";
    this.privacyGroup.add(shell);

    const networkLineMaterial = fadable(
      new THREE.LineBasicMaterial({ color: COLORS.dim, transparent: true, opacity: 0.62 })
    );
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2;
      const radius = index % 2 === 0 ? 3.35 : 2.85;
      const position = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.56,
        Math.sin(angle * 1.7) * 0.65
      );
      const node = makePoints(
        new THREE.IcosahedronGeometry(index % 3 === 0 ? 0.28 : 0.2, 2),
        index % 2 === 0 ? COLORS.cobalt : COLORS.coral,
        0.032,
        0.96
      );
      node.position.copy(position);
      node.userData.target = position.clone();
      this.networkNodes.push(node);
      this.privacyGroup.add(node);

      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        position
      ]);
      const line = new THREE.Line(lineGeometry, networkLineMaterial.clone());
      this.privacyGroup.add(line);
    }
    networkLineMaterial.dispose();
  }

  private updateScene(progress: number, time: number): void {
    const signEnter = smoothstep(rangeProgress(progress, 0.27, 0.4));
    const signExit = smoothstep(rangeProgress(progress, 0.64, 0.74));
    const privacyEnter = smoothstep(rangeProgress(progress, 0.62, 0.75));
    // Keep capture objects hidden while the sticky stage is still travelling
    // into the viewport. Once pinned, reveal them through the capture timeline
    // so mobile Safari does not show a completed scene sliding up the screen.
    setGroupOpacity(this.captureGroup, captureStageOpacity(progress));
    setGroupOpacity(this.signingGroup, signEnter * (1 - signExit));
    setGroupOpacity(this.privacyGroup, privacyEnter);

    // The Capture node represents the presented state: the intro has finished,
    // the objects are settled, and the explanatory copy/callouts are readable.
    // Hold that state until the capture group starts leaving at 0.26.
    const captureProgress = smoothstep(
      rangeProgress(progress, 0, LANDING_PRESENTATION_PROGRESS.capture)
    );
    const viewportAspect = this.camera.aspect;
    const captureLayoutFit = smoothstep(rangeProgress(viewportAspect, 1.05, 1.4));
    this.captureGroup.position.x = mix(0, -0.35 * captureLayoutFit, captureProgress);
    this.captureGroup.rotation.y = mix(-0.08, 0.12, captureProgress);
    if (this.captureGroup.visible) {
      this.cameraRig.rotation.y = Math.sin(time * 0.35) * 0.035;
      this.subjectRig.rotation.set(time * 0.09, time * 0.16, Math.sin(time * 0.2) * 0.05);
      this.subjectRig.scale.setScalar(mix(1.18, 1.34, captureProgress));
      for (const [index, plane] of this.outputRig.children.entries()) {
        if (plane === this.depthBloom) {
          continue;
        }
        plane.position.x = mix(-2.65 - index * 0.22, -3.25 - index * 0.36, captureProgress);
        plane.position.z = mix(0, index === 0 ? 0.38 : -0.38, captureProgress);
        plane.rotation.y = mix(0.12, 0.34, captureProgress);
      }

      const bloomProgress = smoothstep(rangeProgress(captureProgress, 0.28, 0.88));
      this.depthBloom.scale.set(
        mix(0.05, 0.64, bloomProgress),
        mix(0.05, 0.64, bloomProgress),
        mix(0.001, 0.72, bloomProgress)
      );
      this.depthBloom.rotation.set(time * 0.05, mix(-0.45, 0.42, bloomProgress), time * 0.08);
      this.depthBloom.position.x = mix(-3.1, -2.1, bloomProgress);
    }

    const signingProgress = smoothstep(
      rangeProgress(progress, 0.3, LANDING_PRESENTATION_PROGRESS.sign)
    );
    if (this.signingGroup.visible) {
      for (const [index, layer] of this.packageLayers.entries()) {
        const baseX = Number(layer.userData.baseX);
        const baseZ = Number(layer.userData.baseZ);
        const convergence = smoothstep(rangeProgress(signingProgress, 0.42, 0.88));
        layer.position.x = mix(baseX, (index - 1.5) * 0.12, convergence);
        layer.position.z = mix(baseZ, (index - 1.5) * 0.08, convergence);
        layer.rotation.y = mix(-0.24 + index * 0.16, 0.03 * (index - 1.5), convergence);
      }
      const ring = this.signingGroup.getObjectByName("signature-ring");
      const seal = this.signingGroup.getObjectByName("seal-core");
      const sealProgress = smoothstep(rangeProgress(signingProgress, 0.56, 0.92));
      ring?.scale.setScalar(Math.max(0.001, sealProgress));
      if (ring) {
        ring.rotation.z = time * 0.28;
      }
      seal?.scale.setScalar(Math.max(0.001, sealProgress * 0.88));
      if (seal) {
        seal.rotation.y = time * 0.42;
      }
      const scan = this.signingGroup.getObjectByName("signature-scan");
      if (scan) {
        scan.position.x = mix(-2.85, 2.85, (signingProgress * 1.8) % 1);
      }
      this.signingGroup.rotation.y = Math.sin(time * 0.18) * 0.055;
    }

    const privacyProgress = smoothstep(
      rangeProgress(progress, 0.66, LANDING_PRESENTATION_PROGRESS.privacy)
    );
    if (this.privacyGroup.visible) {
      const proofCore = this.privacyGroup.getObjectByName("proof-core");
      const privacyShell = this.privacyGroup.getObjectByName("privacy-shell");
      if (proofCore) {
        proofCore.rotation.set(time * 0.11, time * 0.22, time * 0.08);
        proofCore.scale.setScalar(mix(0.68, 0.96, privacyProgress));
      }
      if (privacyShell) {
        privacyShell.rotation.set(-time * 0.05, time * 0.08, time * 0.035);
        privacyShell.scale.setScalar(mix(0.65, 1.15, privacyProgress));
      }
      for (const [index, node] of this.networkNodes.entries()) {
        const target = node.userData.target as THREE.Vector3;
        node.position.copy(target).multiplyScalar(mix(0.05, 1, privacyProgress));
        node.scale.setScalar(0.78 + Math.sin(time * 1.4 + index) * 0.12);
      }
      this.privacyGroup.rotation.y = Math.sin(time * 0.12) * 0.08;
    }

    const mobile = this.mobileViewport.matches;
    this.captureGroup.scale.setScalar(this.captureScale);
    this.signingGroup.scale.setScalar(this.signingScale);
    this.privacyGroup.scale.setScalar(this.privacyScale);
    const verticalOffset = mobile ? 0.86 : 0.42;
    this.captureGroup.position.y = verticalOffset;
    this.signingGroup.position.y = verticalOffset;
    this.privacyGroup.position.y = verticalOffset;

    const calloutOpacity =
      smoothstep(rangeProgress(progress, 0.04, LANDING_PRESENTATION_PROGRESS.capture)) *
      (1 - smoothstep(rangeProgress(progress, 0.26, 0.34)));
    this.updateCallouts(calloutOpacity, time * 1000);
  }

  private updateCallouts(opacity: number, timeMs: number): void {
    if (opacity <= 0.002) {
      if (this.calloutsVisible) {
        this.calloutsVisible = false;
        this.emitCalloutPositions(0);
      }
      return;
    }

    const minimumCalloutIntervalMs = 1000 / CALLOUT_MAX_FPS;
    if (
      !this.reducedMotion &&
      this.lastCalloutTimeMs > 0 &&
      timeMs - this.lastCalloutTimeMs < minimumCalloutIntervalMs
    ) {
      return;
    }

    this.calloutsVisible = true;
    this.lastCalloutTimeMs = timeMs;
    this.emitCalloutPositions(opacity);
  }

  private emitCalloutPositions(opacity: number): void {
    if (!this.photoCalloutTarget || !this.depthCalloutTarget) {
      return;
    }

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const project = (target: THREE.Object3D): { x: number; y: number } => {
      const point = target.getWorldPosition(this.calloutProjectionPoint).project(this.camera);
      return {
        x: Math.min(100, Math.max(0, (point.x * 0.5 + 0.5) * 100)),
        y: Math.min(100, Math.max(0, (-point.y * 0.5 + 0.5) * 100))
      };
    };

    this.canvas.dispatchEvent(
      new CustomEvent("tapcam:callouts", {
        detail: {
          opacity,
          positions: {
            rgb: project(this.photoCalloutTarget),
            depth: project(this.depthCalloutTarget),
            camera: project(this.cameraCalloutTarget),
            subject: project(this.subjectRig)
          }
        }
      })
    );
  }
}

function makeCameraModule(x: number, y: number, bodyColor: number, accentColor: number): THREE.Group {
  const module = new THREE.Group();
  const body = makePoints(new THREE.BoxGeometry(0.55, 1.18, 1.08, 12, 18, 14), bodyColor, 0.024, 0.9);
  const lensOuter = makePoints(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 64, 7), accentColor, 0.027, 0.95);
  lensOuter.rotation.z = Math.PI / 2;
  lensOuter.position.x = 0.38;
  const lensInner = makePoints(new THREE.TorusGeometry(0.25, 0.055, 10, 80), COLORS.white, 0.02, 0.95);
  lensInner.rotation.y = Math.PI / 2;
  lensInner.position.x = 0.52;
  module.add(body, lensOuter, lensInner);
  module.position.set(x, y, 0);
  module.rotation.z = y > 0 ? -0.05 : 0.05;
  return module;
}

function makeOutputPlane(texture: THREE.Texture, borderColor: number): THREE.Group {
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1.72, 1.18);
  const material = fadable(
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 1 })
  );
  const plane = new THREE.Mesh(geometry, material);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    fadable(new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: 0.92 }))
  );
  frame.position.z = 0.012;
  group.add(plane, frame);
  return group;
}

function makeConnectionLine(from: THREE.Vector3, to: THREE.Vector3, color: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const material = fadable(
    new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.07, transparent: true, opacity: 0.64 })
  );
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  return line;
}

function makePoints(
  geometry: THREE.BufferGeometry,
  color: number,
  size: number,
  opacity: number
): THREE.Points {
  geometry.setIndex(null);
  const material = fadable(
    new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false
    })
  );
  return new THREE.Points(geometry, material);
}

function fadable<T extends FadableMaterial>(material: T): T {
  material.userData.baseOpacity = material.opacity;
  material.transparent = true;
  return material;
}

function setGroupOpacity(group: THREE.Group, opacity: number): void {
  const clamped = Math.min(1, Math.max(0, opacity));
  group.visible = clamped > 0.002;
  const previousOpacity = group.userData.renderOpacity;
  if (typeof previousOpacity === "number" && Math.abs(previousOpacity - clamped) < 0.0001) {
    return;
  }
  group.userData.renderOpacity = clamped;
  group.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Points | THREE.Line | THREE.LineSegments;
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of materials) {
      if (!("opacity" in material)) {
        continue;
      }
      const fadableMaterial = material as FadableMaterial;
      const baseOpacity = Number(fadableMaterial.userData.baseOpacity ?? 1);
      fadableMaterial.opacity = baseOpacity * clamped;
    }
  });
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Points | THREE.Line | THREE.LineSegments;
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function mix(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function sceneScaleForHorizontalFill(
  horizontalViewSize: number,
  designWidth: number,
  minimumScale: number,
  maximumScale: number
): number {
  const fittedScale = horizontalViewSize * SCENE_HORIZONTAL_FILL / designWidth;
  return Math.min(maximumScale, Math.max(minimumScale, fittedScale));
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed) * 43_758.5453;
  return value - Math.floor(value);
}
