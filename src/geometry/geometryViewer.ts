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
      size: 0.018,
      sizeAttenuation: true,
      vertexColors: true
    })
  );
  const maxSize = Math.max(size.x, size.y, size.z, 0.0001);
  model.scale.setScalar(2 / maxSize);
  scene.add(model);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.8;
  controls.maxDistance = 8;

  const resetView = (): void => {
    camera.position.set(0, 0, 3);
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  };
  resetView();

  const resetButton = host.parentElement?.querySelector<HTMLButtonElement>("[data-geometry-reset]");
  resetButton?.addEventListener("click", resetView);

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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
    resetButton?.removeEventListener("click", resetView);
    resizeObserver.disconnect();
    controls.dispose();
    geometry.dispose();
    (model.material as THREE.Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
