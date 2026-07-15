export type Lang = "zh" | "en";
export type TranslationKey = string;
export type TranslationDict = Record<string, string>;
export type Translations = Record<Lang, TranslationDict>;
export type LangChangeListener = (lang: Lang) => void;
