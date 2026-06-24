import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectedPixelCloud } from "./types";

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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
  geometry.setAttribute("color", new THREE.Uint8BufferAttribute(cloud.colors, 3, true));
  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox ?? new THREE.Box3(
    new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(1, 1, 1)
  );

  const model = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: pointSizeForCloud(cloud),
      sizeAttenuation: true,
      vertexColors: true
    })
  );
  scene.add(model);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.05;
  controls.maxDistance = 10;
  const targetDepth = targetDepthForBounds(bounds);

  let userMovedCamera = false;
  let renderViewport = { x: 0, y: 0, width: 1, height: 1 };

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
  const handleResetButtonClick = (): void => {
    userMovedCamera = false;
    resetView();
  };
  resetButton?.addEventListener("click", handleResetButtonClick);

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    renderViewport = fitImageViewport(width, height, cloud.imageWidth, cloud.imageHeight);
    updateCaptureCameraProjection(camera, cloud);
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
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.setViewport(renderViewport.x, renderViewport.y, renderViewport.width, renderViewport.height);
    renderer.setScissor(renderViewport.x, renderViewport.y, renderViewport.width, renderViewport.height);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(render);
  };
  render();

  return () => {
    window.cancelAnimationFrame(animationFrame);
    resetButton?.removeEventListener("click", handleResetButtonClick);
    controls.removeEventListener("start", markCameraMoved);
    resizeObserver.disconnect();
    controls.dispose();
    geometry.dispose();
    (model.material as THREE.Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function pointSizeForCloud(cloud: ProjectedPixelCloud): number {
  const longestEdge = Math.max(cloud.width, cloud.height, 1);
  const projectedSpacing = (cloud.sampleStep / longestEdge) * 2;
  return clamp(projectedSpacing * 2.4, 0.015, 0.034);
}

function updateCaptureCameraProjection(camera: THREE.PerspectiveCamera, cloud: ProjectedPixelCloud): void {
  const near = 0.01;
  const far = 100;
  camera.near = near;
  camera.far = far;
  camera.projectionMatrix.set(
    2 * cloud.fx / cloud.imageWidth,
    0,
    1 - 2 * cloud.cx / cloud.imageWidth,
    0,
    0,
    2 * cloud.fy / cloud.imageHeight,
    2 * cloud.cy / cloud.imageHeight - 1,
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

function fitImageViewport(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number } {
  const imageAspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;
  const canvasAspect = canvasWidth / canvasHeight;
  if (canvasAspect > imageAspect) {
    const width = Math.max(1, Math.floor(canvasHeight * imageAspect));
    return {
      x: Math.floor((canvasWidth - width) / 2),
      y: 0,
      width,
      height: canvasHeight
    };
  }

  const height = Math.max(1, Math.floor(canvasWidth / imageAspect));
  return {
    x: 0,
    y: Math.floor((canvasHeight - height) / 2),
    width: canvasWidth,
    height
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
