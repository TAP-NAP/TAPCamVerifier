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
    ? { verify: "验证器", docs: "文档", download: "下载", github: "GITHUB" }
    : { verify: "VERIFIER", docs: "DOCS", download: "DOWNLOAD", github: "GITHUB" };
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
        <a class="landing-topbar__link" href="https://github.com/TAP-NAP" target="_blank" rel="noopener noreferrer" data-nav-github>${labels.github}</a>
        <button class="landing-topbar__lang" type="button" data-language-toggle data-nav-lang data-locale="${options.locale}" aria-label="${options.locale === "zh" ? "Switch to English" : "切换到中文"}">
          <span lang="zh-CN">中</span><i aria-hidden="true">/</i><span lang="en">EN</span>
        </button>
      </nav>
    </header>
  `;
}
