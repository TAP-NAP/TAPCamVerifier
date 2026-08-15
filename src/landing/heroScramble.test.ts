import { describe, expect, it } from "vitest";
import {
  HERO_SCRAMBLE_HOLD_MS,
  heroPhraseFitScale,
  heroScrambleFrame
} from "./heroScramble";

describe("hero scramble frames", () => {
  it("holds each resolved phrase for the approved interval", () => {
    expect(HERO_SCRAMBLE_HOLD_MS).toBe(4400);
  });

  it("fits long phrases inside their line without enlarging the layout slot", () => {
    expect(heroPhraseFitScale(320, 400)).toBe(0.8);
    expect(heroPhraseFitScale(320, 240)).toBe(1);
    expect(heroPhraseFitScale(0, 400)).toBe(1);
  });

  it("keeps the source and target phrases intact at the animation boundaries", () => {
    expect(heroScrambleFrame("真实的生活", "可验的影像", 0)).toEqual(
      Array.from("真实的生活", (character) => ({ character, state: "resolved" }))
    );
    expect(heroScrambleFrame("真实的生活", "可验的影像", 1)).toEqual(
      Array.from("可验的影像", (character) => ({ character, state: "resolved" }))
    );
  });

  it("passes through a fully scrambled frame before revealing the replacement", () => {
    const frame = heroScrambleFrame("真实的生活", "不可篡改的影像", 0.38, () => 0);

    expect(frame).toHaveLength(7);
    expect(frame.every((glyph) => glyph.state === "scrambled")).toBe(true);
    expect(frame.map((glyph) => glyph.character).join("")).toBe("#######");
  });

  it("locks replacement characters from left to right", () => {
    const frame = heroScrambleFrame("真实的生活", "可验的新闻", 0.75, () => 0);
    const resolvedCount = frame.filter((glyph) => glyph.state === "resolved").length;

    expect(resolvedCount).toBeGreaterThan(0);
    expect(frame.slice(0, resolvedCount).every((glyph) => glyph.state === "resolved")).toBe(
      true
    );
    expect(frame.slice(resolvedCount).every((glyph) => glyph.state === "scrambled")).toBe(
      true
    );
  });
});
