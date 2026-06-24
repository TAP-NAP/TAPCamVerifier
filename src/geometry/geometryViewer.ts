import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ProjectedPixelCloud } from "./types";

export type GeometryViewerCleanup = () => void;

export function mountGeometryViewer(host: HTMLElement, cloud: ProjectedPixelCloud): GeometryViewerCleanup {
  host.textContent = "";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111820);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);

  const model = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: pointSizeForCloud(cloud),
      sizeAttenuation: true,
      vertexColors: true
    })
  );
  const maxSize = Math.max(size.x, size.y, size.z, 0.0001);
  const modelScale = 2 / maxSize;
  model.scale.setScalar(modelScale);
  scene.add(model);

  const framedSize = size.clone().multiplyScalar(modelScale);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 10;

  let userMovedCamera = false;

  const resetView = (): void => {
    const distance = cameraDistanceForSize(camera, framedSize);
    camera.position.set(0, 0, distance);
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.minDistance = Math.max(0.25, distance * 0.25);
    controls.maxDistance = Math.max(distance * 4, 4);
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
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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

function cameraDistanceForSize(camera: THREE.PerspectiveCamera, size: THREE.Vector3): number {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const widthDistance = size.x / 2 / Math.tan(horizontalFov / 2);
  const heightDistance = size.y / 2 / Math.tan(verticalFov / 2);
  const depthPadding = size.z * 0.55;
  return Math.max(widthDistance, heightDistance, 1) * 1.2 + depthPadding;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
