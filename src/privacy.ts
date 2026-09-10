import "./privacy.css";
import { getPreferredLanguage, saveLanguagePreference } from "./i18n/languagePreference";
import type { Lang } from "./i18n/types";

const languageControls = document.querySelector<HTMLElement>("[data-policy-languages]")!;
const languageButtons = document.querySelectorAll<HTMLButtonElement>("[data-policy-language]");
const policies = document.querySelectorAll<HTMLElement>("[data-policy]");

function applyLanguage(language: Lang): void {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = language === "zh" ? "隐私政策 · TAPCam" : "Privacy Policy · TAPCam";
  languageControls.setAttribute("aria-label", language === "zh" ? "政策语言" : "Policy language");
  policies.forEach((policy) => {
    policy.hidden = policy.dataset.policy !== language;
  });
  languageButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.policyLanguage === language));
  });
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const language = button.dataset.policyLanguage as Lang;
    saveLanguagePreference(language);
    applyLanguage(language);
  });
});

applyLanguage(getPreferredLanguage());
languageControls.hidden = false;
