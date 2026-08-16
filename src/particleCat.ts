import * as THREE from "three";
import heroParticleCatCryingUrl from "./assets/hero-particle-cat-crying.webp";
import heroParticleCatSmileUrl from "./assets/hero-particle-cat-kiki.webp";
import heroParticleCatPoutingUrl from "./assets/hero-particle-cat-pouting.webp";
import heroParticleCatSleepyUrl from "./assets/hero-particle-cat-sleepy.webp";

export const PARTICLE_CAT_EXPRESSIONS = ["smile", "sleepy", "crying", "pouting"] as const;
export type ParticleCatExpression = typeof PARTICLE_CAT_EXPRESSIONS[number];

export interface ParticleCatBlockedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const PARTICLE_CAT_COUNT = 1;
export const PARTICLE_CAT_FADE_IN_SECONDS = 1;
export const PARTICLE_CAT_DEFAULT_HOLD_SECONDS = 8;
export const PARTICLE_CAT_FADE_OUT_SECONDS = 1;
export const PARTICLE_CAT_OFF_SECONDS = 1;
export const PARTICLE_CAT_REVEALED_TIME_SECONDS = PARTICLE_CAT_FADE_IN_SECONDS;
export const PARTICLE_ILLUMINATION_RADIUS_SCREEN = 0.26;
export const PARTICLE_CAT_AMBIENT_OPACITY = 0.09;
export const PARTICLE_CAT_HINT_AMBIENT_OPACITY = 0.12;

const EXCITED_HOLD_WEIGHTS = [1, 2, 4, 8, 13, 14, 8, 3] as const;
const EXPRESSION_WEIGHTS: Record<ParticleCatExpression, number> = {
  smile: 12,
  sleepy: 3,
  crying: 2,
  pouting: 3
};
const EXPRESSION_ASSET_URLS: Record<ParticleCatExpression, string> = {
  smile: heroParticleCatSmileUrl,
  sleepy: heroParticleCatSleepyUrl,
  crying: heroParticleCatCryingUrl,
  pouting: heroParticleCatPoutingUrl
};

function clampedParticleCatHoldSeconds(holdSeconds: number): number {
  return THREE.MathUtils.clamp(holdSeconds, 1, 8);
}

export function particleCatHoldEndSeconds(holdSeconds: number): number {
  return PARTICLE_CAT_FADE_IN_SECONDS + clampedParticleCatHoldSeconds(holdSeconds);
}

export function particleCatFadeOutEndSeconds(holdSeconds: number): number {
  return particleCatHoldEndSeconds(holdSeconds) + PARTICLE_CAT_FADE_OUT_SECONDS;
}

export function particleCatCycleSeconds(holdSeconds: number): number {
  return particleCatFadeOutEndSeconds(holdSeconds) + PARTICLE_CAT_OFF_SECONDS;
}

export function particleCatExcitedHoldSeconds(random: () => number): number {
  const totalWeight = EXCITED_HOLD_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let selection = THREE.MathUtils.clamp(random(), 0, 1 - Number.EPSILON) * totalWeight;
  for (let index = 0; index < EXCITED_HOLD_WEIGHTS.length; index += 1) {
    selection -= EXCITED_HOLD_WEIGHTS[index];
    if (selection < 0) return index + 1;
  }
  return 8;
}

export function particleCatExpression(random: () => number): ParticleCatExpression {
  const totalWeight = PARTICLE_CAT_EXPRESSIONS.reduce(
    (sum, expression) => sum + EXPRESSION_WEIGHTS[expression],
    0
  );
  let selection = THREE.MathUtils.clamp(random(), 0, 1 - Number.EPSILON) * totalWeight;
  for (const expression of PARTICLE_CAT_EXPRESSIONS) {
    selection -= EXPRESSION_WEIGHTS[expression];
    if (selection < 0) return expression;
  }
  return "smile";
}

export function particleCatAmbientOpacity(missedAppearances: number): number {
  const isHintAppearance = missedAppearances > 0 && missedAppearances % 7 === 6;
  return isHintAppearance
    ? PARTICLE_CAT_HINT_AMBIENT_OPACITY
    : PARTICLE_CAT_AMBIENT_OPACITY;
}

export function particleCatAmbientOpacityForDeparture(
  missedAppearances: number,
  departureProgress: number
): number {
  return Math.max(
    particleCatAmbientOpacity(missedAppearances),
    THREE.MathUtils.lerp(
      PARTICLE_CAT_AMBIENT_OPACITY,
      PARTICLE_CAT_HINT_AMBIENT_OPACITY,
      THREE.MathUtils.clamp(departureProgress, 0, 1)
    )
  );
}

export function particleCatMissedAppearancesAfterCycle(
  missedAppearances: number,
  wasDiscovered: boolean
): number {
  return wasDiscovered ? 0 : Math.max(0, missedAppearances) + 1;
}

export function particleCatCycleOpacity(
  elapsedSeconds: number,
  reducedMotion = false,
  holdSeconds = PARTICLE_CAT_DEFAULT_HOLD_SECONDS
): number {
  if (reducedMotion) return 1;
  const holdEnd = particleCatHoldEndSeconds(holdSeconds);
  const fadeOutEnd = particleCatFadeOutEndSeconds(holdSeconds);
  const cycleSeconds = particleCatCycleSeconds(holdSeconds);
  const localTime = ((elapsedSeconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
  if (localTime < PARTICLE_CAT_FADE_IN_SECONDS) {
    const progress = localTime / PARTICLE_CAT_FADE_IN_SECONDS;
    return progress * progress * (3 - 2 * progress);
  }
  if (localTime < holdEnd) return 1;
  if (localTime >= fadeOutEnd) return 0;
  const progress = (localTime - holdEnd) / PARTICLE_CAT_FADE_OUT_SECONDS;
  return 1 - progress * progress * (3 - 2 * progress);
}

export function particleCatSizePixels(width: number, height: number): number {
  return Math.min(152, Math.max(72, Math.min(width * 0.24, height * 0.17)));
}

export function particleCatTiltDegrees(random: () => number): number {
  return THREE.MathUtils.clamp((random() * 2 - 1) * 30, -30, 30);
}

export function smoothParticleCatExcitation(
  current: number,
  target: number,
  deltaSeconds: number
): number {
  const clampedTarget = THREE.MathUtils.clamp(target, 0, 1);
  const timeConstant = clampedTarget > current ? 0.16 : 0.28;
  const blend = 1 - Math.exp(-Math.max(0, Math.min(deltaSeconds, 0.1)) / timeConstant);
  return current + (clampedTarget - current) * blend;
}

export function shouldResetParticleCatTimer(
  elapsedSeconds: number,
  hasResetTimer: boolean,
  excitation: number,
  holdSeconds = PARTICLE_CAT_DEFAULT_HOLD_SECONDS
): boolean {
  return !hasResetTimer
    && excitation > 0.02
    && elapsedSeconds >= PARTICLE_CAT_FADE_IN_SECONDS
    && elapsedSeconds < particleCatFadeOutEndSeconds(holdSeconds);
}

export function screenSpaceNdcDistance(
  from: readonly [number, number],
  to: readonly [number, number],
  viewportAspect: number
): number {
  return Math.hypot((from[0] - to[0]) * viewportAspect, from[1] - to[1]);
}

export function particleCatSafePosition(
  width: number,
  height: number,
  sizePixels: number,
  random: () => number,
  avoidPositions: ReadonlyArray<readonly [number, number]> = [],
  blockedRects: readonly ParticleCatBlockedRect[] = []
): [number, number] {
  const mobile = width / Math.max(height, 1) < 0.78;
  const candidates: ReadonlyArray<readonly [number, number]> = mobile
    ? [
        [-0.66, 0.58], [0, 0.58], [0.66, 0.58],
        [-0.68, 0.28], [0.68, 0.28],
        [-0.68, -0.18], [0.68, -0.18], [0, -0.42]
      ]
    : [[-0.48, 0.24], [0.64, 0.38], [0.72, -0.16], [0.42, 0.08], [0.66, -0.46], [0.08, 0.34]];
  const halfWidth = sizePixels / Math.max(width, 1);
  const halfHeight = sizePixels / Math.max(height, 1);
  const xLimit = Math.max(0, 0.94 - halfWidth);
  const yLimit = Math.max(0, 0.92 - halfHeight);
  const aspect = width / Math.max(height, 1);
  const minimumDistance = PARTICLE_ILLUMINATION_RADIUS_SCREEN * 2;
  const jittered = candidates.map(([x, y]): [number, number] => [
    THREE.MathUtils.clamp(x + (random() - 0.5) * 0.08, -xLimit, xLimit),
    THREE.MathUtils.clamp(y + (random() - 0.5) * 0.06, -yLimit, yLimit)
  ]);
  const candidateClearsBlockedRects = ([x, y]: readonly [number, number]): boolean => {
    const centerX = (x + 1) * width / 2;
    const centerY = (1 - y) * height / 2;
    const margin = 12;
    const left = centerX - sizePixels / 2 - margin;
    const right = centerX + sizePixels / 2 + margin;
    const top = centerY - sizePixels / 2 - margin;
    const bottom = centerY + sizePixels / 2 + margin;
    return blockedRects.every((blocked) =>
      right <= blocked.left
      || left >= blocked.right
      || bottom <= blocked.top
      || top >= blocked.bottom
    );
  };
  const textSafe = jittered.filter(candidateClearsBlockedRects);
  const eligible = textSafe.filter((candidate) =>
    avoidPositions.every((other) =>
      screenSpaceNdcDistance(candidate, other, aspect) >= minimumDistance
    )
  );
  const pool = eligible.length > 0 ? eligible : textSafe.length > 0 ? textSafe : jittered;
  if (eligible.length === 0 && avoidPositions.length > 0) {
    return pool.reduce((farthest, candidate) => {
      const candidateDistance = Math.min(...avoidPositions.map((other) =>
        screenSpaceNdcDistance(candidate, other, aspect)
      ));
      const farthestDistance = Math.min(...avoidPositions.map((other) =>
        screenSpaceNdcDistance(farthest, other, aspect)
      ));
      return candidateDistance > farthestDistance ? candidate : farthest;
    });
  }
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

async function createParticleCatGeometry(assetUrl: string): Promise<THREE.BufferGeometry> {
  const image = new Image();
  image.decoding = "async";
  image.src = assetUrl;
  await image.decode();

  const sampleSize = 256;
  const sampleStep = 4;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to sample the particle cat asset.");
  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
  const sampledPositions: number[] = [];
  const sampledColors: number[] = [];

  for (let top = 0; top < sampleSize; top += sampleStep) {
    for (let left = 0; left < sampleSize; left += sampleStep) {
      let brightest = 0;
      let brightestX = left;
      let brightestY = top;
      let brightestOffset = 0;
      for (let y = top; y < Math.min(sampleSize, top + sampleStep); y += 1) {
        for (let x = left; x < Math.min(sampleSize, left + sampleStep); x += 1) {
          const offset = (y * sampleSize + x) * 4;
          const lightness = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
          if (lightness > brightest) {
            brightest = lightness;
            brightestX = x;
            brightestY = y;
            brightestOffset = offset;
          }
        }
      }
      if (brightest < 54) continue;
      sampledPositions.push(
        brightestX / sampleSize - 0.5,
        0.5 - brightestY / sampleSize,
        0
      );
      sampledColors.push(
        pixels[brightestOffset] / 255,
        pixels[brightestOffset + 1] / 255,
        pixels[brightestOffset + 2] / 255
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(sampledPositions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(sampledColors, 3));
  return geometry;
}

export async function createParticleCatGeometries(): Promise<
  Record<ParticleCatExpression, THREE.BufferGeometry>
> {
  const geometries = await Promise.all(PARTICLE_CAT_EXPRESSIONS.map(async (expression) => [
    expression,
    await createParticleCatGeometry(EXPRESSION_ASSET_URLS[expression])
  ] as const));
  return Object.fromEntries(geometries) as Record<ParticleCatExpression, THREE.BufferGeometry>;
}
