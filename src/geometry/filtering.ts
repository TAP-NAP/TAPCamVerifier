import type { ProjectedPixelCloud } from "./types";

export const RISK_CLIPPED_LOW = 1 << 0;
export const RISK_CLIPPED_HIGH = 1 << 1;
export const RISK_NARROW_RANGE = 1 << 2;
export const RISK_ISOLATED_OUTLIER = 1 << 3;
export const RISK_DISCONTINUITY_EDGE = 1 << 4;
export const RISK_ALIGNMENT_EDGE_RISK = 1 << 5;
export const RISK_DISTORTION_UNCORRECTED_EDGE = 1 << 6;

export type PixelProjectionFilterSensitivity = "low" | "medium" | "high";
export type MeshStretchSuppressionStrength = "low" | "medium" | "high";

export interface PixelProjectionFilterOptions {
  sensitivity: PixelProjectionFilterSensitivity;
  showClippedDepth: boolean;
  highlightClippedDepth: boolean;
  showIsolatedOutliers: boolean;
  highlightIsolatedOutliers: boolean;
  showDepthEdges: boolean;
  highlightDepthEdges: boolean;
  showColorMappingRisk: boolean;
  highlightColorMappingRisk: boolean;
}

export interface FilteredPixelCloud {
  positions: Float32Array;
  colors: Uint8Array;
  sourceIndices: Uint32Array | null;
  visiblePointCount: number;
  totalPointCount: number;
}

export interface MeshStretchFilterResult {
  indices: Uint32Array;
  hiddenTriangleCount: number;
}

const OUTLIER_THRESHOLD: Record<PixelProjectionFilterSensitivity, number> = {
  low: 30,
  medium: 20,
  high: 12
};

const DISCONTINUITY_THRESHOLD: Record<PixelProjectionFilterSensitivity, number> = {
  low: 40,
  medium: 25,
  high: 18
};

const MESH_STRETCH_DEPTH_THRESHOLD: Record<MeshStretchSuppressionStrength, number> = {
  low: 0.35,
  medium: 0.22,
  high: 0.12
};

const MESH_STRETCH_ASPECT_THRESHOLD: Record<MeshStretchSuppressionStrength, number> = {
  low: 48,
  medium: 24,
  high: 12
};

export function defaultFilterOptions(): PixelProjectionFilterOptions {
  return {
    sensitivity: "medium",
    showClippedDepth: true,
    highlightClippedDepth: false,
    showIsolatedOutliers: true,
    highlightIsolatedOutliers: false,
    showDepthEdges: true,
    highlightDepthEdges: false,
    showColorMappingRisk: true,
    highlightColorMappingRisk: false
  };
}

export function filterProjectedPixelCloud(
  cloud: ProjectedPixelCloud,
  options: PixelProjectionFilterOptions
): FilteredPixelCloud {
  const totalPointCount = cloud.pointCount;
  if (allRiskTypesShown(options) && noRiskTypesHighlighted(options)) {
    return {
      positions: cloud.positions,
      colors: cloud.colors,
      sourceIndices: null,
      visiblePointCount: totalPointCount,
      totalPointCount
    };
  }

  const visibleIndexes: number[] = [];
  for (let index = 0; index < totalPointCount; index += 1) {
    const hasAnyRisk = pointHasAnyRisk(cloud, options, index);
    const matchesShownRisk = pointMatchesShownRisk(cloud, options, index);
    const visible = !hasAnyRisk || matchesShownRisk;
    if (visible) {
      visibleIndexes.push(index);
    }
  }

  const positions = new Float32Array(visibleIndexes.length * 3);
  const colors = new Uint8Array(visibleIndexes.length * 3);
  visibleIndexes.forEach((sourceIndex, targetIndex) => {
    positions.set(cloud.positions.subarray(sourceIndex * 3, sourceIndex * 3 + 3), targetIndex * 3);
    const color = riskHighlightColorForPoint(cloud, options, sourceIndex);
    if (color) {
      colors.set(color, targetIndex * 3);
    } else {
      colors.set(cloud.colors.subarray(sourceIndex * 3, sourceIndex * 3 + 3), targetIndex * 3);
    }
  });

  return {
    positions,
    colors,
    sourceIndices: Uint32Array.from(visibleIndexes),
    visiblePointCount: visibleIndexes.length,
    totalPointCount
  };
}

export function remapFilteredTriangleIndices(indices: Uint32Array, filtered: FilteredPixelCloud): Uint32Array {
  if (!filtered.sourceIndices) {
    return indices;
  }

  const sourceToFiltered = new Map<number, number>();
  for (let index = 0; index < filtered.sourceIndices.length; index += 1) {
    sourceToFiltered.set(filtered.sourceIndices[index], index);
  }

  const remapped: number[] = [];
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = sourceToFiltered.get(indices[index]);
    const b = sourceToFiltered.get(indices[index + 1]);
    const c = sourceToFiltered.get(indices[index + 2]);
    if (a !== undefined && b !== undefined && c !== undefined) {
      remapped.push(a, b, c);
    }
  }
  return Uint32Array.from(remapped);
}

export function filterMeshStretchTriangleIndices(
  positions: Float32Array,
  indices: Uint32Array,
  strength: MeshStretchSuppressionStrength
): MeshStretchFilterResult {
  const kept: number[] = [];
  let hiddenTriangleCount = 0;

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    if (triangleLooksStretched(positions, a, b, c, strength)) {
      hiddenTriangleCount += 1;
    } else {
      kept.push(a, b, c);
    }
  }

  return {
    indices: hiddenTriangleCount > 0 ? Uint32Array.from(kept) : indices,
    hiddenTriangleCount
  };
}

export function pointMatchesShownRisk(
  cloud: ProjectedPixelCloud,
  options: PixelProjectionFilterOptions,
  index: number
): boolean {
  const flags = cloud.riskFlags[index] ?? 0;
  const clippedFlags = RISK_CLIPPED_LOW | RISK_CLIPPED_HIGH | RISK_NARROW_RANGE;
  if (options.showClippedDepth && (flags & clippedFlags) !== 0) {
    return true;
  }
  if (
    options.showIsolatedOutliers &&
    ((flags & RISK_ISOLATED_OUTLIER) !== 0 ||
      (cloud.outlierScores[index] ?? 0) >= OUTLIER_THRESHOLD[options.sensitivity])
  ) {
    return true;
  }
  if (
    options.showDepthEdges &&
    ((flags & RISK_DISCONTINUITY_EDGE) !== 0 ||
      (cloud.discontinuityScores[index] ?? 0) >= DISCONTINUITY_THRESHOLD[options.sensitivity])
  ) {
    return true;
  }
  if (
    options.showColorMappingRisk &&
    (flags & (RISK_ALIGNMENT_EDGE_RISK | RISK_DISTORTION_UNCORRECTED_EDGE)) !== 0
  ) {
    return true;
  }
  return false;
}

export function pointHasAnyRisk(
  cloud: ProjectedPixelCloud,
  options: Pick<PixelProjectionFilterOptions, "sensitivity">,
  index: number
): boolean {
  const flags = cloud.riskFlags[index] ?? 0;
  const riskFlags =
    RISK_CLIPPED_LOW |
    RISK_CLIPPED_HIGH |
    RISK_NARROW_RANGE |
    RISK_ISOLATED_OUTLIER |
    RISK_DISCONTINUITY_EDGE |
    RISK_ALIGNMENT_EDGE_RISK |
    RISK_DISTORTION_UNCORRECTED_EDGE;
  return (
    (flags & riskFlags) !== 0 ||
    (cloud.outlierScores[index] ?? 0) >= OUTLIER_THRESHOLD[options.sensitivity] ||
    (cloud.discontinuityScores[index] ?? 0) >= DISCONTINUITY_THRESHOLD[options.sensitivity]
  );
}

export function sensitivityFromSliderValue(value: string): PixelProjectionFilterSensitivity {
  if (value === "0") {
    return "low";
  }
  if (value === "2") {
    return "high";
  }
  return "medium";
}

export function sliderValueFromSensitivity(sensitivity: PixelProjectionFilterSensitivity): string {
  if (sensitivity === "low") {
    return "0";
  }
  if (sensitivity === "high") {
    return "2";
  }
  return "1";
}

export function meshStretchStrengthFromSliderValue(value: string): MeshStretchSuppressionStrength {
  if (value === "0") {
    return "low";
  }
  if (value === "2") {
    return "high";
  }
  return "medium";
}

export function sliderValueFromMeshStretchStrength(strength: MeshStretchSuppressionStrength): string {
  if (strength === "low") {
    return "0";
  }
  if (strength === "high") {
    return "2";
  }
  return "1";
}

export function formatSensitivity(sensitivity: PixelProjectionFilterSensitivity): string {
  if (sensitivity === "low") {
    return "Low";
  }
  if (sensitivity === "high") {
    return "High";
  }
  return "Medium";
}

export function formatMeshStretchStrength(strength: MeshStretchSuppressionStrength): string {
  if (strength === "low") {
    return "Low";
  }
  if (strength === "high") {
    return "High";
  }
  return "Medium";
}

function triangleLooksStretched(
  positions: Float32Array,
  a: number,
  b: number,
  c: number,
  strength: MeshStretchSuppressionStrength
): boolean {
  const first = readPosition(positions, a);
  const second = readPosition(positions, b);
  const third = readPosition(positions, c);
  if (!first || !second || !third) {
    return true;
  }

  const minDepth = Math.min(first.depth, second.depth, third.depth);
  const maxDepth = Math.max(first.depth, second.depth, third.depth);
  if (maxDepth - minDepth > MESH_STRETCH_DEPTH_THRESHOLD[strength]) {
    return true;
  }

  const ab = distance(first, second);
  const bc = distance(second, third);
  const ca = distance(third, first);
  const shortest = Math.min(ab, bc, ca);
  const longest = Math.max(ab, bc, ca);
  if (!Number.isFinite(shortest) || !Number.isFinite(longest) || shortest <= 0.000_001) {
    return true;
  }

  return longest / shortest > MESH_STRETCH_ASPECT_THRESHOLD[strength];
}

function readPosition(
  positions: Float32Array,
  index: number
): { x: number; y: number; z: number; depth: number } | null {
  const offset = index * 3;
  const x = positions[offset];
  const y = positions[offset + 1];
  const z = positions[offset + 2];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z, depth: Math.abs(z) };
}

function distance(
  first: { x: number; y: number; z: number },
  second: { x: number; y: number; z: number }
): number {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const dz = first.z - second.z;
  return Math.hypot(dx, dy, dz);
}

function allRiskTypesShown(options: PixelProjectionFilterOptions): boolean {
  return (
    options.showClippedDepth &&
    options.showIsolatedOutliers &&
    options.showDepthEdges &&
    options.showColorMappingRisk
  );
}

function noRiskTypesHighlighted(options: PixelProjectionFilterOptions): boolean {
  return (
    !options.highlightClippedDepth &&
    !options.highlightIsolatedOutliers &&
    !options.highlightDepthEdges &&
    !options.highlightColorMappingRisk
  );
}

function riskHighlightColorForPoint(
  cloud: ProjectedPixelCloud,
  options: PixelProjectionFilterOptions,
  index: number
): [number, number, number] | null {
  const flags = cloud.riskFlags[index] ?? 0;
  const clippedFlags = RISK_CLIPPED_LOW | RISK_CLIPPED_HIGH | RISK_NARROW_RANGE;
  if (options.showClippedDepth && options.highlightClippedDepth && (flags & clippedFlags) !== 0) {
    return [224, 55, 48];
  }
  if (
    options.showIsolatedOutliers &&
    options.highlightIsolatedOutliers &&
    ((flags & RISK_ISOLATED_OUTLIER) !== 0 ||
      (cloud.outlierScores[index] ?? 0) >= OUTLIER_THRESHOLD[options.sensitivity])
  ) {
    return [168, 85, 247];
  }
  if (
    options.showDepthEdges &&
    options.highlightDepthEdges &&
    ((flags & RISK_DISCONTINUITY_EDGE) !== 0 ||
      (cloud.discontinuityScores[index] ?? 0) >= DISCONTINUITY_THRESHOLD[options.sensitivity])
  ) {
    return [245, 158, 11];
  }
  if (
    options.showColorMappingRisk &&
    options.highlightColorMappingRisk &&
    (flags & (RISK_ALIGNMENT_EDGE_RISK | RISK_DISTORTION_UNCORRECTED_EDGE)) !== 0
  ) {
    return [34, 211, 238];
  }
  return null;
}
