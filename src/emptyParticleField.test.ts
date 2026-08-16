import { describe, expect, it } from "vitest";
import {
  particleCatAmbientOpacity,
  particleCatAmbientOpacityForDeparture,
  particleCatCycleOpacity,
  particleCatExcitedHoldSeconds,
  particleCatExpression,
  particleCatMissedAppearancesAfterCycle,
  particleCatSafePosition,
  particleCatSizePixels,
  particleCatTiltDegrees,
  PARTICLE_ILLUMINATION_RADIUS_SCREEN,
  screenSpaceNdcDistance,
  shouldResetParticleCatTimer,
  smoothParticleCatExcitation
} from "./particleCat";

describe("hero particle cat", () => {
  it("fades in, holds, and fully fades out before the next position", () => {
    expect(particleCatCycleOpacity(0)).toBe(0);
    expect(particleCatCycleOpacity(0.5)).toBeGreaterThan(0);
    expect(particleCatCycleOpacity(1)).toBe(1);
    expect(particleCatCycleOpacity(8.9)).toBe(1);
    expect(particleCatCycleOpacity(9.5)).toBeGreaterThan(0);
    expect(particleCatCycleOpacity(10)).toBe(0);
    expect(particleCatCycleOpacity(10.9)).toBe(0);
  });

  it("uses a stable reduced-motion opacity", () => {
    expect(particleCatCycleOpacity(0, true)).toBe(1);
    expect(particleCatCycleOpacity(40, true)).toBe(1);
  });

  it("uses a weighted one-to-eight second hold after the first excitation", () => {
    expect(particleCatExcitedHoldSeconds(() => 0)).toBe(1);
    expect(particleCatExcitedHoldSeconds(() => 0.999999)).toBe(8);

    const evenlySpacedSamples = Array.from({ length: 530 }, (_, index) =>
      particleCatExcitedHoldSeconds(() => (index + 0.5) / 530)
    );
    const middleSamples = evenlySpacedSamples.filter((seconds) => seconds >= 4 && seconds <= 6);
    const mean = evenlySpacedSamples.reduce((sum, seconds) => sum + seconds, 0)
      / evenlySpacedSamples.length;
    expect(middleSamples.length).toBeGreaterThan(evenlySpacedSamples.length / 2);
    expect(mean).toBeGreaterThan(4.5);
  });

  it("uses the chosen hold duration without changing the one-second fades", () => {
    expect(particleCatCycleOpacity(1.9, false, 1)).toBe(1);
    expect(particleCatCycleOpacity(2.5, false, 1)).toBeGreaterThan(0);
    expect(particleCatCycleOpacity(3, false, 1)).toBe(0);
    expect(particleCatCycleOpacity(8.9, false, 8)).toBe(1);
  });

  it("shows the smile more often than every alternate expression", () => {
    const evenlySpacedSamples = Array.from({ length: 2_000 }, (_, index) =>
      particleCatExpression(() => (index + 0.5) / 2_000)
    );
    const counts = { smile: 0, sleepy: 0, crying: 0, pouting: 0 };
    evenlySpacedSamples.forEach((expression) => {
      counts[expression] += 1;
    });
    expect(counts.smile).toBe(1_200);
    expect(counts.sleepy).toBe(300);
    expect(counts.crying).toBe(200);
    expect(counts.pouting).toBe(300);
  });

  it("brightens only every seventh missed appearance and resets after discovery", () => {
    expect(particleCatAmbientOpacity(0)).toBe(0.09);
    expect(particleCatAmbientOpacity(5)).toBe(0.09);
    expect(particleCatAmbientOpacity(6)).toBe(0.12);
    expect(particleCatAmbientOpacity(7)).toBe(0.09);
    expect(particleCatAmbientOpacity(13)).toBe(0.12);
    expect(particleCatMissedAppearancesAfterCycle(6, false)).toBe(7);
    expect(particleCatMissedAppearancesAfterCycle(6, true)).toBe(0);
    expect(particleCatAmbientOpacity(
      particleCatMissedAppearancesAfterCycle(6, true)
    )).toBe(0.09);
  });

  it("matches the hint brightness while the hero is being swiped away", () => {
    expect(particleCatAmbientOpacityForDeparture(0, 0)).toBe(0.09);
    expect(particleCatAmbientOpacityForDeparture(0, 0.5)).toBeCloseTo(0.105);
    expect(particleCatAmbientOpacityForDeparture(0, 1)).toBe(0.12);
    expect(particleCatAmbientOpacityForDeparture(6, 0)).toBe(0.12);
  });

  it("keeps the cat close to the wordmark C scale without growing excessively", () => {
    expect(particleCatSizePixels(393, 852)).toBeCloseTo(94.32);
    expect(particleCatSizePixels(1152, 876)).toBeCloseTo(148.92);
    expect(particleCatSizePixels(2400, 1400)).toBe(152);
  });

  it("keeps random placements inside the viewport safe area", () => {
    const values = [0, 0, 0, 0.999, 0.999, 0.999];
    let index = 0;
    const random = (): number => values[index++ % values.length];
    const mobile = particleCatSafePosition(393, 852, 94, random);
    const desktop = particleCatSafePosition(1152, 876, 149, random);

    expect(Math.abs(mobile[0]) + 94 / 393).toBeLessThanOrEqual(0.94);
    expect(Math.abs(mobile[1]) + 94 / 852).toBeLessThanOrEqual(0.92);
    expect(Math.abs(desktop[0]) + 149 / 1152).toBeLessThanOrEqual(0.94);
    expect(Math.abs(desktop[1]) + 149 / 876).toBeLessThanOrEqual(0.92);
  });

  it("keeps touch placements out of visible text rectangles", () => {
    const random = (): number => 0.5;
    const blocked = [{ left: 0, top: 300, right: 393, bottom: 700 }];
    const [x, y] = particleCatSafePosition(393, 852, 94, random, [], blocked);
    const centerX = (x + 1) * 393 / 2;
    const centerY = (1 - y) * 852 / 2;
    const margin = 94 / 2 + 12;
    const intersects = centerX + margin > blocked[0].left
      && centerX - margin < blocked[0].right
      && centerY + margin > blocked[0].top
      && centerY - margin < blocked[0].bottom;
    expect(intersects).toBe(false);
  });

  it("only tilts the cat head within thirty degrees", () => {
    expect(particleCatTiltDegrees(() => 0)).toBe(-30);
    expect(particleCatTiltDegrees(() => 0.5)).toBe(0);
    expect(particleCatTiltDegrees(() => 1)).toBe(30);
  });

  it("measures hover distance in screen space so the light remains circular", () => {
    expect(screenSpaceNdcDistance([0, 0], [0.2, 0], 0.5)).toBeCloseTo(0.1);
    expect(screenSpaceNdcDistance([0, 0], [0, 0.1], 0.5)).toBeCloseTo(0.1);
    expect(screenSpaceNdcDistance([0, 0], [0.1, 0], 2)).toBeCloseTo(0.2);
    expect(screenSpaceNdcDistance([0, 0], [0, 0.2], 2)).toBeCloseTo(0.2);
  });

  it("keeps the next cat position at least one illumination diameter from the previous one", () => {
    const values = [0.1, 0.7, 0.3, 0.9, 0.2, 0.8, 0.4, 0.6, 0.5];
    let index = 0;
    const random = (): number => values[index++ % values.length];
    const first = particleCatSafePosition(393, 852, 94, random);
    const second = particleCatSafePosition(393, 852, 94, random, [first]);
    const distance = screenSpaceNdcDistance(first, second, 393 / 852);
    expect(distance).toBeGreaterThanOrEqual(PARTICLE_ILLUMINATION_RADIUS_SCREEN * 2);
  });

  it("fades excitation in and out instead of snapping", () => {
    const fadedIn = smoothParticleCatExcitation(0, 1, 1 / 60);
    const fadedOut = smoothParticleCatExcitation(1, 0, 1 / 60);
    expect(fadedIn).toBeGreaterThan(0);
    expect(fadedIn).toBeLessThan(1);
    expect(fadedOut).toBeGreaterThan(0);
    expect(fadedOut).toBeLessThan(1);
  });

  it("only resets the B or C timer once per appearance", () => {
    expect(shouldResetParticleCatTimer(0.8, false, 1)).toBe(false);
    expect(shouldResetParticleCatTimer(1.2, false, 1)).toBe(true);
    expect(shouldResetParticleCatTimer(9.8, false, 1)).toBe(true);
    expect(shouldResetParticleCatTimer(2, true, 1)).toBe(false);
    expect(shouldResetParticleCatTimer(10.2, false, 1)).toBe(false);
  });
});
