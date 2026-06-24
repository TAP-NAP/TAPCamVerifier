import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeometryRenderMode, ProjectedPixelCloud } from "./types";

export type GeometryViewerCleanup = () => void;

export function mountGeometryViewer(host: HTMLElement, cloud: ProjectedPixelCloud): GeometryViewerCleanup {
  host.textContent = "";

  const backgroundColor = new THREE.Color(0x111820);
  const scene = new THREE.Scene();
  scene.background = backgroundColor;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(backgroundColor);
  renderer.autoClear = false;
  renderer.domElement.className = "geometry-canvas";
  renderer.domElement.dataset.projectionCanvas = "true";
  host.append(renderer.domElement);

  const pointGeometry = createColoredGeometry(cloud);
  pointGeometry.computeBoundingBox();

  const bounds = pointGeometry.boundingBox ?? new THREE.Box3(
    new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(1, 1, 1)
  );

  const pointMaterial = new THREE.PointsMaterial({
    size: pointSizeForCloud(cloud),
    sizeAttenuation: true,
    vertexColors: true
  });
  const pointModel = new THREE.Points(pointGeometry, pointMaterial);
  scene.add(pointModel);

  const meshGeometry = cloud.mesh ? createColoredGeometry(cloud) : null;
  const meshMaterial = cloud.mesh
    ? new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        vertexColors: true
      })
    : null;
  const meshModel = meshGeometry && meshMaterial && cloud.mesh
    ? new THREE.Mesh(meshGeometry, meshMaterial)
    : null;
  if (meshGeometry && cloud.mesh) {
    meshGeometry.setIndex(new THREE.BufferAttribute(cloud.mesh.indices, 1));
    meshGeometry.computeVertexNormals();
  }
  if (meshModel) {
    meshModel.visible = false;
    scene.add(meshModel);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.05;
  controls.maxDistance = 10;
  const targetDepth = targetDepthForBounds(bounds);

  let userMovedCamera = false;
  let canvasSize = { width: 1, height: 1 };

  const resetView = (): void => {
    camera.position.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, -targetDepth);
    controls.minDistance = Math.max(0.01, targetDepth * 0.05);
    controls.maxDistance = Math.max(4, targetDepth * 6);
    controls.update();
  };
  const markCameraMoved = (): void => {
    userMovedCamera = true;
  };
  controls.addEventListener("start", markCameraMoved);

  const resetButton = host.parentElement?.querySelector<HTMLButtonElement>("[data-geometry-reset]");
  const modeButtons = Array.from(
    host.parentElement?.querySelectorAll<HTMLButtonElement>("[data-geometry-mode]") ?? []
  );
  const activeModeLabel = host.parentElement?.parentElement?.querySelector<HTMLElement>(
    "[data-geometry-active-mode]"
  );
  const handleResetButtonClick = (): void => {
    userMovedCamera = false;
    resetView();
  };
  resetButton?.addEventListener("click", handleResetButtonClick);
  const setMode = (mode: GeometryRenderMode): void => {
    const nextMode: GeometryRenderMode = mode === "mesh-rgb" && meshModel ? "mesh-rgb" : "point-cloud";
    pointModel.visible = nextMode === "point-cloud";
    if (meshModel) {
      meshModel.visible = nextMode === "mesh-rgb";
    }
    renderer.domElement.dataset.geometryMode = nextMode;
    if (activeModeLabel) {
      activeModeLabel.textContent = formatGeometryRenderMode(nextMode);
    }
    for (const button of modeButtons) {
      const pressed = button.dataset.geometryMode === nextMode;
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    }
  };
  const handleModeButtonClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const mode = button.dataset.geometryMode;
    if (mode === "point-cloud" || mode === "mesh-rgb") {
      setMode(mode);
    }
  };
  for (const button of modeButtons) {
    button.addEventListener("click", handleModeButtonClick);
  }
  setMode("point-cloud");

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvasSize = { width, height };
    renderer.setSize(width, height, false);
    updateCaptureCameraProjection(camera, cloud, width, height);
    if (!userMovedCamera) {
      resetView();
    }
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  let animationFrame = 0;
  const render = (): void => {
    controls.update();
    renderer.clear(true, true, true);
    renderer.setViewport(0, 0, canvasSize.width, canvasSize.height);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(render);
  };
  render();

  return () => {
    window.cancelAnimationFrame(animationFrame);
    resetButton?.removeEventListener("click", handleResetButtonClick);
    for (const button of modeButtons) {
      button.removeEventListener("click", handleModeButtonClick);
    }
    controls.removeEventListener("start", markCameraMoved);
    resizeObserver.disconnect();
    controls.dispose();
    pointGeometry.dispose();
    pointMaterial.dispose();
    meshGeometry?.dispose();
    meshMaterial?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function createColoredGeometry(cloud: ProjectedPixelCloud): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
  geometry.setAttribute("color", new THREE.Uint8BufferAttribute(cloud.colors, 3, true));
  return geometry;
}

function pointSizeForCloud(cloud: ProjectedPixelCloud): number {
  const longestEdge = Math.max(cloud.width, cloud.height, 1);
  const projectedSpacing = (cloud.sampleStep / longestEdge) * 2;
  return clamp(projectedSpacing * 2.4, 0.015, 0.034);
}

function updateCaptureCameraProjection(
  camera: THREE.PerspectiveCamera,
  cloud: ProjectedPixelCloud,
  canvasWidth: number,
  canvasHeight: number
): void {
  const near = 0.01;
  const far = 100;
  const canvasIntrinsics = cameraIntrinsicsForFullCanvas(cloud, canvasWidth, canvasHeight);
  camera.near = near;
  camera.far = far;
  camera.projectionMatrix.set(
    2 * canvasIntrinsics.fx / canvasWidth,
    0,
    1 - 2 * canvasIntrinsics.cx / canvasWidth,
    0,
    0,
    2 * canvasIntrinsics.fy / canvasHeight,
    2 * canvasIntrinsics.cy / canvasHeight - 1,
    0,
    0,
    0,
    -(far + near) / (far - near),
    -2 * far * near / (far - near),
    0,
    0,
    -1,
    0
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function cameraIntrinsicsForFullCanvas(
  cloud: ProjectedPixelCloud,
  canvasWidth: number,
  canvasHeight: number
): { fx: number; fy: number; cx: number; cy: number } {
  const imageAspect = cloud.imageWidth > 0 && cloud.imageHeight > 0 ? cloud.imageWidth / cloud.imageHeight : 1;
  const canvasAspect = canvasWidth / canvasHeight;
  if (canvasAspect > imageAspect) {
    const fittedWidth = canvasHeight * imageAspect;
    const xOffset = (canvasWidth - fittedWidth) / 2;
    const scale = fittedWidth / cloud.imageWidth;
    return {
      fx: cloud.fx * scale,
      fy: cloud.fy * scale,
      cx: xOffset + cloud.cx * scale,
      cy: cloud.cy * scale
    };
  }

  const fittedHeight = canvasWidth / imageAspect;
  const yOffset = (canvasHeight - fittedHeight) / 2;
  const scale = fittedHeight / cloud.imageHeight;
  return {
    fx: cloud.fx * scale,
    fy: cloud.fy * scale,
    cx: cloud.cx * scale,
    cy: yOffset + cloud.cy * scale
  };
}

function targetDepthForBounds(bounds: THREE.Box3): number {
  if (bounds.isEmpty()) {
    return 1;
  }
  const center = bounds.getCenter(new THREE.Vector3());
  return Math.max(0.25, -center.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatGeometryRenderMode(mode: GeometryRenderMode): string {
  return mode === "mesh-rgb" ? "Mesh RGB" : "Point Cloud";
}
