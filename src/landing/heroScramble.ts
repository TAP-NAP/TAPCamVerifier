export type HeroScrambleGlyph = {
  character: string;
  state: "resolved" | "scrambled";
};

export const HERO_SCRAMBLE_CHARACTERS = Array.from("#7%/□01+×△◇");
const SCRAMBLE_PEAK = 0.38;

export const HERO_SCRAMBLE_HOLD_MS = 4400;

export function heroPhraseFitScale(availableWidth: number, phraseWidth: number): number {
  if (availableWidth <= 0 || phraseWidth <= 0) {
    return 1;
  }
  return Math.min(1, availableWidth / phraseWidth);
}

export function heroSafeGlyphCapacity(
  availableWidth: number,
  widestGlyphWidth: number,
  safetyReserve = 1
): number {
  if (availableWidth <= 0 || widestGlyphWidth <= 0) {
    return 1;
  }

  const measuredCapacity = Math.floor(availableWidth / widestGlyphWidth);
  return Math.max(1, measuredCapacity - Math.max(0, Math.floor(safetyReserve)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function randomScrambleCharacter(random: () => number): string {
  const index = Math.min(
    HERO_SCRAMBLE_CHARACTERS.length - 1,
    Math.floor(random() * HERO_SCRAMBLE_CHARACTERS.length)
  );
  return HERO_SCRAMBLE_CHARACTERS[index];
}

export function heroScrambleFrame(
  source: string,
  target: string,
  progress: number,
  random: () => number = Math.random
): HeroScrambleGlyph[] {
  const normalized = clamp01(progress);
  const sourceCharacters = Array.from(source);
  const targetCharacters = Array.from(target);

  if (normalized === 0) {
    return sourceCharacters.map((character) => ({ character, state: "resolved" }));
  }
  if (normalized === 1) {
    return targetCharacters.map((character) => ({ character, state: "resolved" }));
  }

  const width = Math.max(sourceCharacters.length, targetCharacters.length);
  const glyphs: HeroScrambleGlyph[] = [];

  if (normalized < SCRAMBLE_PEAK) {
    const scrambleAmount = smoothstep(normalized / SCRAMBLE_PEAK);
    for (let index = 0; index < width; index += 1) {
      const sourceCharacter = sourceCharacters[index];
      const shouldScramble = !sourceCharacter || random() < scrambleAmount;
      glyphs.push(
        shouldScramble
          ? { character: randomScrambleCharacter(random), state: "scrambled" }
          : { character: sourceCharacter, state: "resolved" }
      );
    }
    return glyphs;
  }

  const revealAmount = smoothstep(
    (normalized - SCRAMBLE_PEAK) / (1 - SCRAMBLE_PEAK)
  );
  const revealedCharacters = Math.floor(revealAmount * targetCharacters.length);

  for (let index = 0; index < width; index += 1) {
    const targetCharacter = targetCharacters[index];
    if (targetCharacter && index < revealedCharacters) {
      glyphs.push({ character: targetCharacter, state: "resolved" });
    } else {
      glyphs.push({ character: randomScrambleCharacter(random), state: "scrambled" });
    }
  }

  return glyphs;
}
