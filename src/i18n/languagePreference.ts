import type { Lang } from "./types";

export const LANGUAGE_STORAGE_KEY = "tapcam.lang";
const LEGACY_LANDING_LANGUAGE_STORAGE_KEY = "tapcam.landing.lang";

export function resolveLanguagePreference(
  storedLanguage: string | null,
  browserLanguages: readonly string[]
): Lang {
  if (storedLanguage === "zh" || storedLanguage === "en") {
    return storedLanguage;
  }

  return browserLanguages.some((language) => language.toLowerCase().startsWith("zh"))
    ? "zh"
    : "en";
}

export function readLanguagePreference(): Lang | null {
  if (typeof window === "undefined") return null;

  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage === "zh" || storedLanguage === "en") {
      return storedLanguage;
    }

    const legacyLanguage = window.localStorage.getItem(LEGACY_LANDING_LANGUAGE_STORAGE_KEY);
    return legacyLanguage === "zh" || legacyLanguage === "en" ? legacyLanguage : null;
  } catch {
    return null;
  }
}

export function getPreferredLanguage(): Lang {
  const storedLanguage = readLanguagePreference();
  const browserLanguages =
    typeof navigator === "undefined"
      ? ["en"]
      : navigator.languages ?? [navigator.language || "en"];

  return resolveLanguagePreference(storedLanguage, browserLanguages);
}

export function saveLanguagePreference(language: Lang): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The language still changes for this page when persistence is unavailable.
  }
}
