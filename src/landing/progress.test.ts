import { describe, expect, it } from "vitest";
import {
  LANDING_PRESENTATION_PROGRESS,
  LANDING_SCENE_TIMELINE,
  LANDING_STAGE_TRANSITIONS,
  MOBILE_CAPTURE_PANEL_ENTRANCE,
  captureStageOpacity,
  chapterNaturalTop,
  chapterPanelBoundary,
  chapterPanelEntryOpacity,
  chapterPanelOpacity,
  directionalSnapTarget,
  landingStageForProgress,
  mobileCapturePanelContentOpacity,
  mobileCapturePanelLiftProgress,
  pageProgressForStoryProgress,
  presentationTopForCopy,
  privacyStageOpacity,
  progressForActiveStep,
  progressNavigationDuration,
  rangeProgress,
  smoothstep,
  signStageOpacity,
  stableFixedControlTop,
  storyEntranceProgressFromGeometry,
  storyPresentationProgress,
  storyProgressFromGeometry,
  storySceneProgress,
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

  it("previews scene 01 while the story is pulled into the viewport", () => {
    expect(storySceneProgress(0, 0)).toBe(0);
    expect(storySceneProgress(0, 0.5)).toBeCloseTo(0.0694, 3);
    expect(storySceneProgress(0, 1)).toBe(LANDING_PRESENTATION_PROGRESS.capture);
    expect(storySceneProgress(0.5, 1)).toBe(0.5);
  });

  it("holds a settled chapter panel before fading into the next scene", () => {
    const settledAt = LANDING_PRESENTATION_PROGRESS.capture;
    const exitsAt = LANDING_STAGE_TRANSITIONS.sign;
    const fadeStart = settledAt + (exitsAt - settledAt) * 0.45;

    expect(chapterPanelOpacity(settledAt, settledAt, exitsAt)).toBe(1);
    expect(chapterPanelOpacity(fadeStart, settledAt, exitsAt)).toBe(1);
    expect(chapterPanelOpacity((fadeStart + exitsAt) / 2, settledAt, exitsAt)).toBeCloseTo(0.5);
    expect(chapterPanelOpacity(exitsAt, settledAt, exitsAt)).toBe(0);
  });

  it("keeps the incoming panel hidden until the previous stage has fully exited", () => {
    expect(chapterPanelEntryOpacity(0.339, 0.34, 0.5)).toBe(0);
    expect(chapterPanelEntryOpacity(0.34, 0.34, 0.5)).toBe(0);
    expect(chapterPanelEntryOpacity(0.36, 0.34, 0.5)).toBeCloseTo(0.5);
    expect(chapterPanelEntryOpacity(0.38, 0.34, 0.5)).toBe(1);
  });

  it("normalizes and eases a local animation range", () => {
    expect(rangeProgress(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
    expect(rangeProgress(0, 0.2, 0.6)).toBe(0);
    expect(rangeProgress(1, 0.2, 0.6)).toBe(1);
  });

  it("reveals capture objects only after the story stage is pinned", () => {
    expect(captureStageOpacity(0)).toBe(0);
    expect(captureStageOpacity(0.05)).toBeCloseTo(0.5);
    expect(captureStageOpacity(LANDING_PRESENTATION_PROGRESS.capture)).toBe(1);
    expect(captureStageOpacity(LANDING_SCENE_TIMELINE.capture.exitEnd)).toBe(0);
  });

  it("uses the same breathing window between both scene changes", () => {
    expect(captureStageOpacity(0.32)).toBe(0);
    expect(signStageOpacity(0.32)).toBe(0);
    expect(signStageOpacity(0.68)).toBe(0);
    expect(privacyStageOpacity(0.68)).toBe(0);
  });

  it("pulls the mobile capture panel into place before revealing its labels", () => {
    expect(MOBILE_CAPTURE_PANEL_ENTRANCE.liftStart).toBe(0.72);
    expect(MOBILE_CAPTURE_PANEL_ENTRANCE.liftEnd).toBeLessThanOrEqual(
      MOBILE_CAPTURE_PANEL_ENTRANCE.contentStart
    );
    expect(mobileCapturePanelLiftProgress(0.71)).toBe(0);
    expect(mobileCapturePanelLiftProgress(0.81)).toBeCloseTo(0.5);
    expect(mobileCapturePanelLiftProgress(0.9)).toBe(1);
    expect(mobileCapturePanelContentOpacity(0.9)).toBe(0);
    expect(mobileCapturePanelContentOpacity(0.95)).toBeCloseTo(0.5);
    expect(mobileCapturePanelContentOpacity(1)).toBe(1);
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

  it("scales progress-node navigation to the actual travel distance", () => {
    expect(progressNavigationDuration(0, 900)).toBe(620);
    expect(progressNavigationDuration(900, 900)).toBe(1040);
    expect(progressNavigationDuration(1800, 900)).toBe(1560);
    expect(progressNavigationDuration(5000, 900)).toBe(1800);
  });

  it("keeps fixed progress geometry independent of visual viewport translation", () => {
    expect(stableFixedControlTop(852, 65, 0)).toBe(787);
    expect(stableFixedControlTop(852, 65, 12)).toBe(775);
  });

  it("recovers a panel's natural top independently of sticky positioning", () => {
    expect(chapterNaturalTop(1400, 40, 320, 88, 220)).toBe(732);
  });

  it("keeps navigation geometry stable while following Safari's visible bottom", () => {
    expect(chapterPanelBoundary(775, 790, 0, 744, false)).toBe(775);
    expect(chapterPanelBoundary(775, 790, 0, 744, true)).toBe(744);
    expect(chapterPanelBoundary(775, 720, 0, 744, true)).toBe(720);
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
