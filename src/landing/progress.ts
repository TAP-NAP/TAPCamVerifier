export type LandingStage = "capture" | "sign" | "privacy";
export type ScrollDirection = -1 | 0 | 1;

export const LANDING_PRESENTATION_PROGRESS = {
  capture: 0.1,
  sign: 0.5,
  privacy: 0.995
} as const;

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

export function pageProgressForStoryProgress(progress: number): number {
  const normalized = clamp01(progress);

  if (normalized < 0.34) {
    return 0.25 + rangeProgress(normalized, 0, 0.34) * 0.25;
  }

  if (normalized < 0.68) {
    return 0.5 + rangeProgress(normalized, 0.34, 0.68) * 0.25;
  }

  return 0.75 + rangeProgress(normalized, 0.68, 1) * 0.19;
}

export function progressForActiveStep(activeIndex: number, stepCount: number): number {
  if (stepCount <= 1) {
    return 0;
  }
  return clamp01(activeIndex / (stepCount - 1));
}

export function presentationTopForCopy(
  viewportHeight: number,
  progressHeight: number,
  copyHeight: number,
  bottomGap = 24,
  preferredTopRatio = 0.64
): number {
  const safeViewportHeight = Math.max(0, viewportHeight);
  const availableBottom = Math.max(
    0,
    safeViewportHeight - Math.max(0, progressHeight) - Math.max(0, bottomGap)
  );
  return Math.max(
    0,
    Math.min(
      safeViewportHeight * clamp01(preferredTopRatio),
      availableBottom - Math.max(0, copyHeight)
    )
  );
}

export function directionalSnapTarget(
  position: number,
  snapPoints: readonly number[],
  direction: ScrollDirection,
  originIndex: number,
  triggerDistance: number,
  overshootDistance = 0,
  edgeEpsilon = 2
): number | null {
  if (direction === 0 || snapPoints.length === 0 || triggerDistance <= 0) {
    return null;
  }

  if (direction > 0) {
    for (let index = Math.max(0, originIndex + 1); index < snapPoints.length; index += 1) {
      const distance = snapPoints[index] - position;
      if (distance >= -overshootDistance && distance <= edgeEpsilon) {
        return snapPoints[index];
      }
      if (distance > edgeEpsilon) {
        return distance <= triggerDistance ? snapPoints[index] : null;
      }
    }
    return null;
  }

  for (let index = Math.min(originIndex - 1, snapPoints.length - 1); index >= 0; index -= 1) {
    const distance = position - snapPoints[index];
    if (distance >= -overshootDistance && distance <= edgeEpsilon) {
      return snapPoints[index];
    }
    if (distance > edgeEpsilon) {
      return distance <= triggerDistance ? snapPoints[index] : null;
    }
  }

  return null;
}

export function storyProgressFromGeometry(
  top: number,
  height: number,
  viewportHeight: number
): number {
  const scrollableDistance = Math.max(1, height - viewportHeight);
  return clamp01(-top / scrollableDistance);
}
