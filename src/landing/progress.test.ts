import { describe, expect, it } from "vitest";
import {
  directionalSnapTarget,
  landingStageForProgress,
  pageProgressForStoryProgress,
  presentationTopForCopy,
  progressForActiveStep,
  rangeProgress,
  smoothstep,
  storyEntranceProgressFromGeometry,
  storyPresentationProgress,
  storyProgressFromGeometry,
  updateFullyVisibleStack
} from "./progress";

describe("landing scroll progress", () => {
  it("clamps the story to its scrollable range", () => {
    expect(storyProgressFromGeometry(100, 4000, 1000)).toBe(0);
    expect(storyProgressFromGeometry(-1500, 4000, 1000)).toBe(0.5);
    expect(storyProgressFromGeometry(-5000, 4000, 1000)).toBe(1);
  });

  it("maps the three narrative chapters at stable boundaries", () => {
    expect(landingStageForProgress(0.1)).toBe("capture");
    expect(landingStageForProgress(0.34)).toBe("sign");
    expect(landingStageForProgress(0.68)).toBe("privacy");
  });

  it("normalizes and eases a local animation range", () => {
    expect(rangeProgress(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
    expect(rangeProgress(0, 0.2, 0.6)).toBe(0);
    expect(rangeProgress(1, 0.2, 0.6)).toBe(1);
  });

  it("aligns story chapters to the five-step page rail", () => {
    expect(pageProgressForStoryProgress(0)).toBeCloseTo(0.25);
    expect(pageProgressForStoryProgress(0.34)).toBeCloseTo(0.5);
    expect(pageProgressForStoryProgress(0.68)).toBeCloseTo(0.75);
    expect(pageProgressForStoryProgress(1)).toBeCloseTo(0.94);
  });

  it("fills the rail exactly to the center of the active node", () => {
    expect(progressForActiveStep(0, 5)).toBe(0);
    expect(progressForActiveStep(1, 5)).toBe(0.25);
    expect(progressForActiveStep(2, 5)).toBe(0.5);
    expect(progressForActiveStep(3, 5)).toBe(0.75);
    expect(progressForActiveStep(4, 5)).toBe(1);
  });

  it("keeps the latest fully visible action on top of a navigation stack", () => {
    let stack = updateFullyVisibleStack([0], [], 1);
    expect(stack).toEqual([0]);

    stack = updateFullyVisibleStack([0, 1], stack, 1);
    expect(stack).toEqual([0, 1]);

    stack = updateFullyVisibleStack([1, 2], stack, 1);
    expect(stack).toEqual([0, 1, 2]);

    stack = updateFullyVisibleStack([1, 2], stack, -1);
    expect(stack).toEqual([0, 1, 2]);

    stack = updateFullyVisibleStack([0, 1], stack, -1);
    expect(stack).toEqual([0, 1]);

    stack = updateFullyVisibleStack([0], stack, -1);
    expect(stack).toEqual([0]);
  });

  it("reveals the story scene while it enters below the hero", () => {
    expect(storyEntranceProgressFromGeometry(1000, 1000)).toBe(0);
    expect(storyEntranceProgressFromGeometry(500, 1000)).toBe(0.5);
    expect(storyEntranceProgressFromGeometry(0, 1000)).toBe(1);
  });

  it("aligns the chapter copy bottom with the progress bar top", () => {
    expect(presentationTopForCopy(914, 144)).toBe(770);
  });

  it("keeps a fixed gap between chapter copy and progress bar", () => {
    expect(presentationTopForCopy(914, 144, 12)).toBe(758);
  });

  it("preserves bottom alignment when the copy is taller than the available region", () => {
    expect(presentationTopForCopy(280, 300, 12)).toBe(-32);
  });

  it("maps layout-dependent chapter positions to stable animation states", () => {
    const chapterProgresses = [0.043, 0.512, 0.982];

    expect(storyPresentationProgress(0.043, chapterProgresses)).toBeCloseTo(0.1);
    expect(storyPresentationProgress(0.512, chapterProgresses)).toBeCloseTo(0.5);
    expect(storyPresentationProgress(0.982, chapterProgresses)).toBeCloseTo(0.9);
    expect(storyPresentationProgress(1, chapterProgresses)).toBe(1);
  });

  it("only snaps toward the user's intended next stage", () => {
    const points = [0, 1000, 2200, 3400, 4600];

    expect(directionalSnapTarget(820, points, 1, 0, 220)).toBe(1000);
    expect(directionalSnapTarget(1080, points, 1, 1, 300)).toBeNull();
    expect(directionalSnapTarget(1180, points, -1, 2, 240)).toBe(1000);
    expect(directionalSnapTarget(3380, points, -1, 3, 500)).toBeNull();
  });

  it("does not pull the stage being left back into place", () => {
    const points = [0, 1000, 2200];

    expect(directionalSnapTarget(1050, points, 1, 1, 500)).toBeNull();
    expect(directionalSnapTarget(950, points, -1, 1, 500)).toBeNull();
  });

  it("catches a small input overshoot only on the intended next stage", () => {
    const points = [0, 1000, 2200];

    expect(directionalSnapTarget(1030, points, 1, 0, 250, 80)).toBe(1000);
    expect(directionalSnapTarget(970, points, -1, 2, 250, 80)).toBe(1000);
    expect(directionalSnapTarget(1120, points, 1, 0, 250, 80)).toBeNull();
  });
});
