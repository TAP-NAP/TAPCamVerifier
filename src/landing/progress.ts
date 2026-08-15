export type LandingStage = "capture" | "sign" | "privacy";

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function rangeProgress(value: number, start: number, end: number): number {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
  return clamp01((value - start) / (end - start));
}

export function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function landingStageForProgress(progress: number): LandingStage {
  const normalized = clamp01(progress);
  if (normalized < 0.34) {
    return "capture";
  }
  if (normalized < 0.68) {
    return "sign";
  }
  return "privacy";
}

export function storyProgressFromGeometry(
  top: number,
  height: number,
  viewportHeight: number
): number {
  const scrollableDistance = Math.max(1, height - viewportHeight);
  return clamp01(-top / scrollableDistance);
}
