export interface TapCamTopbarOptions {
  assetBase: string;
  homeHref: string;
  verifyHref: string;
  locale: "zh" | "en";
  navAriaLabel: string;
  verifyActive?: boolean;
  copyKeys?: {
    verify?: string;
    docs?: string;
    download?: string;
  };
}

export function getTapCamTopbarLabels(locale: "zh" | "en") {
  return locale === "zh"
    ? { verify: "验证器", docs: "文档", download: "下载" }
    : { verify: "VERIFIER", docs: "DOCS", download: "DOWNLOAD" };
}

export function renderTapCamTopbar(options: TapCamTopbarOptions): string {
  const labels = getTapCamTopbarLabels(options.locale);
  const copyAttribute = (key: string | undefined): string =>
    key ? ` data-copy="${key}"` : "";
  const currentPageAttribute = options.verifyActive ? ' aria-current="page"' : "";

  return `
    <header class="landing-topbar" data-tapcam-topbar>
      <a class="landing-topbar__brand" href="${options.homeHref}" aria-label="TAPCam home">
        <img src="${options.assetBase}launch_logo.png" alt="" width="34" height="34" />
        <strong data-nav-brand-text>TAPCam</strong>
      </a>
      <nav class="landing-topbar__nav" aria-label="${options.navAriaLabel}" data-top-navigation>
        <a class="landing-topbar__link landing-topbar__link--download" href="https://testflight.apple.com/join/bwcgjzNd" target="_blank" rel="noopener noreferrer" data-nav-download${copyAttribute(options.copyKeys?.download)}>${labels.download}</a>
        <a class="landing-topbar__link landing-topbar__link--verify" href="${options.verifyHref}" data-nav-tool${currentPageAttribute}${copyAttribute(options.copyKeys?.verify)}>${labels.verify}</a>
        <a class="landing-topbar__link landing-topbar__link--docs" href="https://github.com/TAP-NAP/TAPCamVerifier/blob/main/Docs/VerificationFlow.md" target="_blank" rel="noopener noreferrer" data-nav-doc${copyAttribute(options.copyKeys?.docs)}>${labels.docs}</a>
        <a class="landing-topbar__link landing-topbar__icon-link" href="https://github.com/TAP-NAP" target="_blank" rel="noopener noreferrer" data-nav-github aria-label="GitHub">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
        </a>
        <button class="landing-topbar__lang" type="button" data-language-toggle data-nav-lang data-locale="${options.locale}" aria-label="${options.locale === "zh" ? "Switch to English" : "切换到中文"}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.2 2.47 3.33 5.47 3.33 9S14.2 18.53 12 21c-2.2-2.47-3.33-5.47-3.33-9S9.8 5.47 12 3Z" />
          </svg>
        </button>
      </nav>
    </header>
  `;
}
