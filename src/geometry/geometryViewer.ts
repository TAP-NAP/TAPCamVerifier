import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  defaultFilterOptions,
  filterProjectedPixelCloud,
  formatSensitivity,
  sensitivityFromSliderValue,
  sliderValueFromSensitivity,
  type PixelProjectionFilterOptions
} from "./filtering";
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

  const boundsGeometry = new THREE.BufferGeometry();
  boundsGeometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
  boundsGeometry.computeBoundingBox();
  const bounds = boundsGeometry.boundingBox ?? new THREE.Box3(
    new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(1, 1, 1)
  );
  boundsGeometry.dispose();

  let geometry = new THREE.BufferGeometry();
  const material = new THREE.PointsMaterial({
    size: pointSizeForCloud(cloud),
    sizeAttenuation: true,
    vertexColors: true
  });

  const model = new THREE.Points(geometry, material);
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

  const shell = host.parentElement;
  const filterPanel = shell?.querySelector<HTMLElement>("[data-geometry-filter-panel]");
  const filterToggle = shell?.querySelector<HTMLButtonElement>("[data-geometry-filter-toggle]");
  const resetButton = shell?.querySelector<HTMLButtonElement>("[data-geometry-reset]");
  const sensitivityInput = shell?.querySelector<HTMLInputElement>("[data-geometry-filter-sensitivity]");
  const sensitivityLabel = shell?.querySelector<HTMLElement>("[data-geometry-filter-sensitivity-label]");
  const visiblePoints = shell?.parentElement?.querySelector<HTMLElement>("[data-geometry-visible-points]");
  const activeFilter = shell?.parentElement?.querySelector<HTMLElement>("[data-geometry-active-filter]");
  const riskShowButtons = Array.from(
    shell?.querySelectorAll<HTMLButtonElement>("[data-geometry-risk-show]") ?? []
  );
  const riskHighlightButtons = Array.from(
    shell?.querySelectorAll<HTMLButtonElement>("[data-geometry-risk-highlight]") ?? []
  );
  let filterOptions = defaultFilterOptions();
  let filterPanelCollapsed = false;

  const applyFilter = (): void => {
    const filtered = filterProjectedPixelCloud(cloud, filterOptions);
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(filtered.positions, 3));
    nextGeometry.setAttribute("color", new THREE.Uint8BufferAttribute(filtered.colors, 3, true));
    geometry.dispose();
    geometry = nextGeometry;
    model.geometry = geometry;
    if (visiblePoints) {
      visiblePoints.textContent = String(filtered.visiblePointCount);
    }
    if (activeFilter) {
      activeFilter.textContent = formatFilterSummary(filterOptions);
    }
  };
  const syncControls = (): void => {
    if (sensitivityInput) {
      sensitivityInput.value = sliderValueFromSensitivity(filterOptions.sensitivity);
    }
    if (sensitivityLabel) {
      sensitivityLabel.textContent = formatSensitivity(filterOptions.sensitivity);
    }
    syncFilterPanelToggle(filterPanel, filterToggle, filterPanelCollapsed);
    for (const button of riskShowButtons) {
      switch (button.dataset.geometryRiskShow) {
        case "clipped":
          syncRiskToggle(button, filterOptions.showClippedDepth, "Show", "Hide", false);
          break;
        case "outliers":
          syncRiskToggle(button, filterOptions.showIsolatedOutliers, "Show", "Hide", false);
          break;
        case "edges":
          syncRiskToggle(button, filterOptions.showDepthEdges, "Show", "Hide", false);
          break;
        case "color":
          syncRiskToggle(button, filterOptions.showColorMappingRisk, "Show", "Hide", false);
          break;
      }
    }
    for (const button of riskHighlightButtons) {
      switch (button.dataset.geometryRiskHighlight) {
        case "clipped":
          syncRiskToggle(
            button,
            filterOptions.showClippedDepth && filterOptions.highlightClippedDepth,
            "Highlight",
            "Unhighlight",
            !filterOptions.showClippedDepth
          );
          break;
        case "outliers":
          syncRiskToggle(
            button,
            filterOptions.showIsolatedOutliers && filterOptions.highlightIsolatedOutliers,
            "Highlight",
            "Unhighlight",
            !filterOptions.showIsolatedOutliers
          );
          break;
        case "edges":
          syncRiskToggle(
            button,
            filterOptions.showDepthEdges && filterOptions.highlightDepthEdges,
            "Highlight",
            "Unhighlight",
            !filterOptions.showDepthEdges
          );
          break;
        case "color":
          syncRiskToggle(
            button,
            filterOptions.showColorMappingRisk && filterOptions.highlightColorMappingRisk,
            "Highlight",
            "Unhighlight",
            !filterOptions.showColorMappingRisk
          );
          break;
      }
    }
  };
  const handleSensitivityInput = (): void => {
    filterOptions = {
      ...filterOptions,
      sensitivity: sensitivityFromSliderValue(sensitivityInput?.value ?? "1")
    };
    syncControls();
    applyFilter();
  };
  const handleRiskToggleClick = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const showRisk = button.dataset.geometryRiskShow;
    const highlightRisk = button.dataset.geometryRiskHighlight;
    if (showRisk) {
      filterOptions = setRiskShow(filterOptions, showRisk, !getRiskShow(filterOptions, showRisk));
    } else if (highlightRisk) {
      filterOptions = setRiskHighlight(
        filterOptions,
        highlightRisk,
        !getRiskHighlight(filterOptions, highlightRisk)
      );
    }
    syncControls();
    applyFilter();
  };
  const handleFilterToggleClick = (): void => {
    filterPanelCollapsed = !filterPanelCollapsed;
    syncControls();
  };
  const handleResetButtonClick = (): void => {
    userMovedCamera = false;
    resetView();
  };
  filterToggle?.addEventListener("click", handleFilterToggleClick);
  resetButton?.addEventListener("click", handleResetButtonClick);
  sensitivityInput?.addEventListener("input", handleSensitivityInput);
  for (const button of riskShowButtons) {
    button.addEventListener("click", handleRiskToggleClick);
  }
  for (const button of riskHighlightButtons) {
    button.addEventListener("click", handleRiskToggleClick);
  }
  syncControls();
  applyFilter();

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
    filterToggle?.removeEventListener("click", handleFilterToggleClick);
    resetButton?.removeEventListener("click", handleResetButtonClick);
    sensitivityInput?.removeEventListener("input", handleSensitivityInput);
    for (const button of riskShowButtons) {
      button.removeEventListener("click", handleRiskToggleClick);
    }
    for (const button of riskHighlightButtons) {
      button.removeEventListener("click", handleRiskToggleClick);
    }
    controls.removeEventListener("start", markCameraMoved);
    resizeObserver.disconnect();
    controls.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function syncRiskToggle(
  button: HTMLButtonElement,
  active: boolean,
  activeLabel: string,
  inactiveLabel: string,
  disabled: boolean
): void {
  button.textContent = active ? activeLabel : inactiveLabel;
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.disabled = disabled;
}

function getRiskShow(options: PixelProjectionFilterOptions, risk: string): boolean {
  switch (risk) {
    case "clipped":
      return options.showClippedDepth;
    case "outliers":
      return options.showIsolatedOutliers;
    case "edges":
      return options.showDepthEdges;
    case "color":
      return options.showColorMappingRisk;
    default:
      return false;
  }
}

function setRiskShow(
  options: PixelProjectionFilterOptions,
  risk: string,
  value: boolean
): PixelProjectionFilterOptions {
  switch (risk) {
    case "clipped":
      return { ...options, showClippedDepth: value, highlightClippedDepth: value ? options.highlightClippedDepth : false };
    case "outliers":
      return {
        ...options,
        showIsolatedOutliers: value,
        highlightIsolatedOutliers: value ? options.highlightIsolatedOutliers : false
      };
    case "edges":
      return { ...options, showDepthEdges: value, highlightDepthEdges: value ? options.highlightDepthEdges : false };
    case "color":
      return {
        ...options,
        showColorMappingRisk: value,
        highlightColorMappingRisk: value ? options.highlightColorMappingRisk : false
      };
    default:
      return options;
  }
}

function getRiskHighlight(options: PixelProjectionFilterOptions, risk: string): boolean {
  switch (risk) {
    case "clipped":
      return options.showClippedDepth && options.highlightClippedDepth;
    case "outliers":
      return options.showIsolatedOutliers && options.highlightIsolatedOutliers;
    case "edges":
      return options.showDepthEdges && options.highlightDepthEdges;
    case "color":
      return options.showColorMappingRisk && options.highlightColorMappingRisk;
    default:
      return false;
  }
}

function setRiskHighlight(
  options: PixelProjectionFilterOptions,
  risk: string,
  value: boolean
): PixelProjectionFilterOptions {
  switch (risk) {
    case "clipped":
      return options.showClippedDepth ? { ...options, highlightClippedDepth: value } : options;
    case "outliers":
      return options.showIsolatedOutliers ? { ...options, highlightIsolatedOutliers: value } : options;
    case "edges":
      return options.showDepthEdges ? { ...options, highlightDepthEdges: value } : options;
    case "color":
      return options.showColorMappingRisk ? { ...options, highlightColorMappingRisk: value } : options;
    default:
      return options;
  }
}

function syncFilterPanelToggle(
  filterPanel: HTMLElement | null | undefined,
  filterToggle: HTMLButtonElement | null | undefined,
  filterPanelCollapsed: boolean
): void {
  if (!filterPanel || !filterToggle) {
    return;
  }
  filterPanel.classList.toggle("is-collapsed", filterPanelCollapsed);
  filterToggle.textContent = filterPanelCollapsed ? "+" : "-";
  filterToggle.setAttribute("aria-expanded", filterPanelCollapsed ? "false" : "true");
  filterToggle.setAttribute(
    "aria-label",
    filterPanelCollapsed ? "Expand point filters" : "Collapse point filters"
  );
}

function formatFilterSummary(options: PixelProjectionFilterOptions): string {
  const sensitivity = formatSensitivity(options.sensitivity);
  const shownRiskCount = shownRiskTypeCount(options);
  if (shownRiskCount === 0) {
    return `Clean · ${sensitivity}`;
  }
  if (allRiskTypesShown(options)) {
    return anyRiskTypeHighlighted(options) ? `Raw · highlighted risk · ${sensitivity}` : `Raw · ${sensitivity}`;
  }
  const riskTypeLabel = shownRiskCount === 1 ? "risk type" : "risk types";
  return anyRiskTypeHighlighted(options)
    ? `Clean + ${shownRiskCount} ${riskTypeLabel} · highlighted · ${sensitivity}`
    : `Clean + ${shownRiskCount} ${riskTypeLabel} · ${sensitivity}`;
}

function shownRiskTypeCount(options: PixelProjectionFilterOptions): number {
  return [
    options.showClippedDepth,
    options.showIsolatedOutliers,
    options.showDepthEdges,
    options.showColorMappingRisk
  ].filter(Boolean).length;
}

function allRiskTypesShown(options: PixelProjectionFilterOptions): boolean {
  return (
    options.showClippedDepth &&
    options.showIsolatedOutliers &&
    options.showDepthEdges &&
    options.showColorMappingRisk
  );
}

function anyRiskTypeHighlighted(options: PixelProjectionFilterOptions): boolean {
  return (
    (options.showClippedDepth && options.highlightClippedDepth) ||
    (options.showIsolatedOutliers && options.highlightIsolatedOutliers) ||
    (options.showDepthEdges && options.highlightDepthEdges) ||
    (options.showColorMappingRisk && options.highlightColorMappingRisk)
  );
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
