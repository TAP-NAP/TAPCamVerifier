import type { Lang, LangChangeListener } from "./types";
import { translations } from "./translations";

function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages || [navigator.language || "en"];
  for (const lang of langs) {
    if (lang.toLowerCase().startsWith("zh")) {
      return "zh";
    }
  }
  return "en";
}

let currentLang: Lang = detectLang();
const listeners = new Set<LangChangeListener>();

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (currentLang === lang) return;
  currentLang = lang;
  listeners.forEach((fn) => fn(lang));
}

export function toggleLang(): Lang {
  const next: Lang = currentLang === "zh" ? "en" : "zh";
  setLang(next);
  return next;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = translations[currentLang];
  let text = dict[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export function onLangChange(listener: LangChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
