import { describe, expect, it } from "vitest";
import {
  landingStageForProgress,
  rangeProgress,
  smoothstep,
  storyProgressFromGeometry
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
});
