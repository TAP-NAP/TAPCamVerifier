import "./landing.css";
import "./topbar.css";
import {
  clamp01,
  chapterNaturalTop,
  chapterPanelEntryOpacity,
  chapterPanelOpacity,
  directionalSnapTarget,
  landingStageForProgress,
  LANDING_PANEL_TIMELINE,
  LANDING_PRESENTATION_PROGRESS,
  MOBILE_CAPTURE_PANEL_ENTRANCE,
  privacyStageOpacity,
  presentationTopForCopy,
  progressForActiveStep,
  progressNavigationDuration,
  signStageOpacity,
  storyEntranceProgressFromGeometry,
  storyPresentationProgress,
  storyProgressFromGeometry,
  storySceneProgress,
  updateFullyVisibleStack,
  type LandingStage,
  type ScrollDirection
} from "./landing/progress";
import {
  getInitialLandingLocale,
  landingCopy,
  landingHeroCopy,
  saveLandingLocale,
  type LandingCopyKey,
  type LandingLocale
} from "./landing/locale";
import {
  HERO_SCRAMBLE_CHARACTERS,
  HERO_SCRAMBLE_HOLD_MS,
  heroPhraseFitScale,
  heroSafeGlyphCapacity,
  heroScrambleFrame,
  type HeroScrambleGlyph
} from "./landing/heroScramble";
import { mountEmptyParticleField } from "./emptyParticleField";
import type { LandingScene } from "./landingScene";
import { renderTapCamTopbar } from "./ui/topbar";

const landing = document.querySelector<HTMLElement>("#landing");

if (!landing) {
  throw new Error("Missing #landing root.");
}

let currentLocale = getInitialLandingLocale();

landing.innerHTML = `
  <a class="skip-link" href="#capture-story" data-copy="skip">跳到产品原理</a>

  ${renderTapCamTopbar({
    assetBase: "./",
    homeHref: "#intro",
    verifyHref: "./verify/",
    locale: currentLocale,
    navAriaLabel: currentLocale === "zh" ? "TAPCam 主导航" : "TAPCam navigation",
    copyKeys: {
      verify: "nav.verifier",
      docs: "nav.docs",
      download: "nav.download"
    }
  })}

  <nav class="landing-progress" aria-label="页面章节" data-page-progress>
    <span class="landing-progress__rail" aria-hidden="true"><i data-page-progress-line></i></span>
    <div class="landing-progress__steps">
      <a href="#intro" data-progress-step="intro" aria-label="00 INTRO" aria-current="step">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>00</b><small><span class="progress-label--full">INTRO</span><span class="progress-label--compact" aria-hidden="true">INTRO</span></small></span>
      </a>
      <a href="#capture" data-progress-step="capture" aria-label="01 CAPTURE">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>01</b><small><span class="progress-label--full">CAPTURE</span><span class="progress-label--compact" aria-hidden="true">CAPTURE</span></small></span>
      </a>
      <a href="#bind-sign" data-progress-step="sign" aria-label="02 BIND &amp; SIGN">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>02</b><small><span class="progress-label--full">BIND &amp; SIGN</span><span class="progress-label--compact" aria-hidden="true">SIGN</span></small></span>
      </a>
      <a href="#open-verification" data-progress-step="privacy" aria-label="03 OPEN VERIFICATION">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>03</b><small><span class="progress-label--full">OPEN VERIFICATION</span><span class="progress-label--compact" aria-hidden="true">VERIFY</span></small></span>
      </a>
      <a href="#next" data-progress-step="next" aria-label="04 NEXT">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>04</b><small><span class="progress-label--full">NEXT</span><span class="progress-label--compact" aria-hidden="true">NEXT</span></small></span>
      </a>
    </div>
  </nav>
  <p class="visually-hidden" role="status" aria-live="polite" data-page-status></p>

  <section class="landing-hero" id="intro" aria-labelledby="landing-title">
    <div class="hero-particles" data-hero-particles aria-hidden="true"></div>
    <div class="hero-lockup">
      <span class="hero-wordmark" aria-label="TAPCam">TAPCam</span>
    </div>
    <div class="hero-copy">
      <p class="hero-kicker">SPATIAL MEDIA</p>
      <h1 id="landing-title">
        <span class="hero-title__accessible visually-hidden" data-hero-accessible>
          在 AI 时代，记录我们的生活
        </span>
        <span class="hero-title__visual" aria-hidden="true">
          <span class="hero-title__lead" data-hero-lead>
            <span class="hero-title__lead-part" data-hero-lead-primary>在 AI 时代，</span>
            <span class="hero-title__lead-part" data-hero-lead-secondary>记录</span>
          </span>
          <span class="hero-title__decode">
            <span class="hero-title__value" data-hero-value>我们的生活</span>
          </span>
        </span>
      </h1>
      <p class="hero-body" data-copy-html="hero.body">
        AI 时代下，摄影还有价值吗？<br />
        在充斥着 AI 内容的当下，我们如何让真实的内容被看见？<br />
        正如摄影不会替代绘画，而 AI 生图也无法取代摄影。<br />
        TAPCam 就是这样一款帮助你记录的摄影软件，让你的感受、表达在 AI 时代也能被看见。
      </p>
      <div class="scroll-cue" aria-hidden="true">
        <svg viewBox="0 0 96 24" focusable="false">
          <path d="M2 2 48 22 94 2" />
        </svg>
      </div>
    </div>
  </section>

  <section class="story" id="capture-story" data-story data-stage="capture" tabindex="-1" aria-label="TAPCam 工作原理">
    <div class="story-stage" aria-hidden="true">
      <canvas class="story-canvas" data-story-canvas></canvas>
      <div class="story-fallback" data-story-fallback hidden>
        <span>TAPCam</span>
        <small>RGB · DEPTH · APP ATTEST · CONTENT BINDING</small>
      </div>
      <div class="scene-callouts scene-callouts--capture">
        <span class="scene-callout scene-callout--rgb" data-scene-callout="rgb">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.rgb">RGB 图像</span>
        </span>
        <span class="scene-callout scene-callout--depth" data-scene-callout="depth">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.depth">深度数据</span>
        </span>
        <span class="scene-callout scene-callout--camera" data-scene-callout="camera">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.camera">空间相机</span>
        </span>
        <span class="scene-callout scene-callout--subject" data-scene-callout="subject">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.subject">被摄对象</span>
        </span>
      </div>
      <div class="scene-labels scene-labels--sign">
        <span>MEDIA</span><span>DEPTH</span><span>ATTESTATION</span><span>SIGNATURE</span>
      </div>
      <div class="scene-labels scene-labels--privacy">
        <span>LOCAL FIRST</span><span>OPEN SOURCE</span><span>ZKP (COMING SOON)</span>
      </div>
    </div>

    <div class="story-chapters">
      <article class="story-chapter story-chapter--capture" id="capture" data-chapter="capture">
        <div class="chapter-copy chapter-copy--left">
          <p class="chapter-number">01 / CAPTURE</p>
          <h2 data-copy-html="capture.title">捕捉色彩，<br />记录纵深。</h2>
          <p data-copy="capture.body">
            TAPCam 不仅仅是一台相机，更是一台空间相机。我们利用此技术来记录被拍摄的照片的环境。从而确保我们所拍摄的内容是取自一个真实场景。
          </p>
          <p class="chapter-note">DEPTH PHOTO &lt;- SPATIAL CAM &lt;- REAL WORLD</p>
        </div>
      </article>

      <article class="story-chapter story-chapter--sign" id="bind-sign" data-chapter="sign">
        <div class="chapter-copy chapter-copy--right">
          <p class="chapter-number">02 / BIND &amp; SIGN</p>
          <h2 data-copy-html="sign.title">安全，<br />保证创作的真实性。</h2>
          <p data-copy="sign.body">
            我们使用苹果的 App Attest 技术；我们把影像数据、深度数据、可验证凭证绑定在一起，从而确保每个人的拍摄都可以被验证。
          </p>
          <p class="chapter-note">MEDIA · DEPTH · ATTESTATION · SIGNATURE</p>
        </div>
      </article>

      <article class="story-chapter story-chapter--privacy" id="open-verification" data-chapter="privacy">
        <div class="chapter-copy chapter-copy--left">
          <p class="chapter-number">03 / OPEN VERIFICATION</p>
          <h2 data-copy-html="privacy.title">证明及验证，<br />是基本权利。</h2>
          <p data-copy="privacy.body">
            软件完全开源（在正式版上架后），因为我们认为，在 AI 时代下，证明自己是作者本人是一项基本权利。同时，我们欢迎更多人加入来进行维护。未来会引入 ZKP 技术，以提供更好的匿名性。
          </p>
          <div class="research-tags" data-copy-aria-label="privacy.tagsLabel" aria-label="验证原则与后续能力">
            <span>LOCAL FIRST</span>
            <span>OPEN SOURCE</span>
            <span>ZKP (COMING SOON)</span>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section class="action-section" id="next" aria-labelledby="action-title">
    <div class="action-heading">
      <p>04 / NEXT</p>
      <h2 id="action-title" data-copy="action.title">从现在开始，记录当下。</h2>
    </div>
    <div class="action-grid">
      <a class="action-link action-link--download" href="https://testflight.apple.com/join/bwcgjzNd" target="_blank" rel="noopener noreferrer">
        <span class="action-index">01</span>
        <span class="action-type">DOWNLOAD</span>
        <strong data-copy="action.download.title">下载 TAPCam</strong>
        <span data-copy="action.download.body">现在参与 TestFlight 进行测试</span>
      </a>
      <a class="action-link action-link--verify" href="./verify/">
        <span class="action-index">02</span>
        <span class="action-type">VERIFY</span>
        <strong data-copy="action.verify.title">打开验证器</strong>
        <span data-copy="action.verify.body">验证照片与视频是否使用了 TAPCam 进行创作</span>
      </a>
      <a class="action-link action-link--docs" href="https://github.com/TAP-NAP/TAPCamVerifier/blob/main/Docs/VerificationFlow.md" target="_blank" rel="noopener noreferrer">
        <span class="action-index">03</span>
        <span class="action-type">TECHNOLOGY</span>
        <strong data-copy="action.docs.title">阅读技术文档</strong>
        <span data-copy="action.docs.body">了解协议、数据边界与验证流程</span>
      </a>
    </div>
    <footer class="landing-footer">
      <p>Build by Harold with love</p>
    </footer>
  </section>
`;

const story = document.querySelector<HTMLElement>("[data-story]");
const storyStageElement = document.querySelector<HTMLElement>(".story-stage");
const canvas = document.querySelector<HTMLCanvasElement>("[data-story-canvas]");
const fallback = document.querySelector<HTMLElement>("[data-story-fallback]");
const actionSection = document.querySelector<HTMLElement>("#next");
const actionLinks = Array.from(
  document.querySelectorAll<HTMLAnchorElement>(".action-link")
);
const pageProgress = document.querySelector<HTMLElement>("[data-page-progress]");
const pageProgressLine = document.querySelector<HTMLElement>("[data-page-progress-line]");
const pageProgressLinks = Array.from(
  document.querySelectorAll<HTMLAnchorElement>("[data-progress-step]")
);
const pageStatus = document.querySelector<HTMLElement>("[data-page-status]");
const chapterCopies = Array.from(
  document.querySelectorAll<HTMLElement>("[data-chapter] .chapter-copy")
);
type SceneCalloutName = "rgb" | "depth" | "camera" | "subject";
type CalloutPoint = { x: number; y: number };
type PixelRect = { left: number; top: number; right: number; bottom: number };
type ProjectedRect = { left: number; top: number; right: number; bottom: number };
type CalloutDirection =
  | "above"
  | "aboveLeft"
  | "aboveRight"
  | "below"
  | "belowLeft"
  | "belowRight"
  | "left"
  | "right"
  | "farAbove"
  | "farBelow";

const sceneCalloutNames: SceneCalloutName[] = ["rgb", "camera", "subject", "depth"];
const sceneCallouts = new Map<SceneCalloutName, HTMLElement>();
for (const element of document.querySelectorAll<HTMLElement>("[data-scene-callout]")) {
  const name = element.dataset.sceneCallout as SceneCalloutName | undefined;
  if (name) {
    sceneCallouts.set(name, element);
  }
}
const sceneCalloutLabelSizes = new Map<SceneCalloutName, { width: number; height: number }>();
const sceneCalloutDirections = new Map<SceneCalloutName, CalloutDirection>();
const languageButton = document.querySelector<HTMLButtonElement>("[data-language-toggle]");
const topNavigation = document.querySelector<HTMLElement>("[data-top-navigation]");
const heroLead = document.querySelector<HTMLElement>("[data-hero-lead]");
const heroLeadPrimary = document.querySelector<HTMLElement>("[data-hero-lead-primary]");
const heroLeadSecondary = document.querySelector<HTMLElement>("[data-hero-lead-secondary]");
const heroValue = document.querySelector<HTMLElement>("[data-hero-value]");
const heroAccessible = document.querySelector<HTMLElement>("[data-hero-accessible]");
const heroParticles = document.querySelector<HTMLElement>("[data-hero-particles]");

if (
  !story ||
  !storyStageElement ||
  !canvas ||
  !fallback ||
  !actionSection ||
  actionLinks.length !== 3 ||
  !pageProgress ||
  !pageProgressLine ||
  pageProgressLinks.length !== 5 ||
  !pageStatus ||
  chapterCopies.length !== 3 ||
  !languageButton ||
  !topNavigation ||
  !heroLead ||
  !heroLeadPrimary ||
  !heroLeadSecondary ||
  !heroValue ||
  !heroAccessible ||
  !heroParticles
) {
  throw new Error("Landing story did not mount.");
}

type LandingPageStage = "intro" | LandingStage | "next";

const pageStageIndex: Record<LandingPageStage, number> = {
  intro: 0,
  capture: 1,
  sign: 2,
  privacy: 3,
  next: 4
};

const pageStages: readonly LandingPageStage[] = [
  "intro",
  "capture",
  "sign",
  "privacy",
  "next"
];

const pageStageAnnouncements: Record<LandingLocale, Record<LandingPageStage, string>> = {
  zh: {
    intro: "介绍",
    capture: "捕获",
    sign: "绑定与签名",
    privacy: "开放验证",
    next: "下一步"
  },
  en: {
    intro: "Introduction",
    capture: "Capture",
    sign: "Bind and sign",
    privacy: "Open verification",
    next: "Next"
  }
};

let currentPageStage: LandingPageStage = "intro";
let resetHeroScramble: (() => void) | undefined;
let heroPhraseScale = 1;
let heroScrambleCapacity = 1;

function renderHeroPhrase(glyphs: readonly HeroScrambleGlyph[]): void {
  const fragment = document.createDocumentFragment();
  const visibleGlyphs = glyphs.some((glyph) => glyph.state === "scrambled")
    ? glyphs.slice(0, heroScrambleCapacity)
    : glyphs;
  for (const glyph of visibleGlyphs) {
    const character = document.createElement("span");
    character.className = "hero-title__glyph";
    character.dataset.state = glyph.state;
    character.textContent = glyph.character;
    fragment.append(character);
  }
  heroValue!.replaceChildren(fragment);
  heroValue!.style.setProperty("--hero-phrase-scale", heroPhraseScale.toFixed(4));
}

function renderResolvedHeroPhrase(phrase: string): void {
  heroValue!.textContent = phrase;
  heroValue!.dataset.scrambling = "false";
  heroValue!.style.setProperty("--hero-phrase-scale", heroPhraseScale.toFixed(4));
}

function fitHeroPhrasesToSafeLine(): void {
  const line = heroValue!.closest<HTMLElement>(".hero-title__decode");
  if (!line) {
    return;
  }

  const measurement = heroValue!.cloneNode(false) as HTMLElement;
  measurement.removeAttribute("data-hero-value");
  measurement.dataset.scrambling = "false";
  measurement.setAttribute("aria-hidden", "true");
  measurement.style.position = "absolute";
  measurement.style.visibility = "hidden";
  measurement.style.minWidth = "0";
  measurement.style.width = "max-content";
  measurement.style.transform = "none";
  line.append(measurement);

  let widestPhrase = 0;
  for (const phrase of landingHeroCopy(currentLocale).phrases) {
    measurement.textContent = phrase;
    widestPhrase = Math.max(widestPhrase, measurement.scrollWidth);
  }
  measurement.remove();

  heroPhraseScale = heroPhraseFitScale(Math.max(0, line.clientWidth - 2), widestPhrase);
  heroValue!.style.setProperty("--hero-phrase-scale", heroPhraseScale.toFixed(4));

  const glyphMeasurement = heroValue!.cloneNode(false) as HTMLElement;
  glyphMeasurement.removeAttribute("data-hero-value");
  glyphMeasurement.dataset.scrambling = "true";
  glyphMeasurement.setAttribute("aria-hidden", "true");
  glyphMeasurement.style.position = "absolute";
  glyphMeasurement.style.visibility = "hidden";
  glyphMeasurement.style.width = "max-content";
  glyphMeasurement.style.minWidth = "0";
  glyphMeasurement.style.transform = "none";
  for (const glyph of HERO_SCRAMBLE_CHARACTERS) {
    const probe = document.createElement("span");
    probe.className = "hero-title__glyph";
    probe.dataset.state = "scrambled";
    probe.textContent = glyph;
    glyphMeasurement.append(probe);
  }
  line.append(glyphMeasurement);
  const widestGlyph = Math.max(
    1,
    ...Array.from(glyphMeasurement.children, (child) =>
      (child as HTMLElement).getBoundingClientRect().width
    )
  );
  glyphMeasurement.remove();
  heroScrambleCapacity = heroSafeGlyphCapacity(
    Math.max(0, line.clientWidth - 2),
    widestGlyph,
    1
  );
}

function setHeroAccessibleCopy(lead: string, phrase: string): void {
  heroAccessible!.textContent = currentLocale === "zh" ? `${lead}${phrase}` : `${lead} ${phrase}`;
}

function applyLandingLocale(locale: LandingLocale): void {
  currentLocale = locale;
  landing!.dataset.locale = locale;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.title = "type cam";

  document.querySelectorAll<HTMLElement>("[data-copy]").forEach((element) => {
    element.textContent = landingCopy(locale, element.dataset.copy as LandingCopyKey);
  });
  document.querySelectorAll<HTMLElement>("[data-copy-html]").forEach((element) => {
    element.innerHTML = landingCopy(locale, element.dataset.copyHtml as LandingCopyKey);
  });
  document.querySelectorAll<HTMLElement>("[data-copy-aria-label]").forEach((element) => {
    element.setAttribute(
      "aria-label",
      landingCopy(locale, element.dataset.copyAriaLabel as LandingCopyKey)
    );
  });

  const localizedHero = landingHeroCopy(locale);
  heroLeadPrimary!.textContent = localizedHero.leadParts[0];
  heroLeadSecondary!.textContent = localizedHero.leadParts[1];
  renderResolvedHeroPhrase(localizedHero.phrases[0]);
  fitHeroPhrasesToSafeLine();
  setHeroAccessibleCopy(localizedHero.lead, localizedHero.phrases[0]);
  resetHeroScramble?.();

  sceneCalloutLabelSizes.clear();
  sceneCalloutDirections.clear();

  document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute(
      "content",
      locale === "zh"
        ? "TAPCam 将媒体、深度数据与采集凭证绑定在同一次捕获中，让原始文件离开相机后仍能被独立检查。"
        : "TAPCam binds media, depth data, and capture evidence in one capture so original files remain independently inspectable after leaving the camera."
    );

  languageButton!.dataset.locale = locale;
  languageButton!.setAttribute(
    "aria-label",
    locale === "zh" ? "Switch to English" : "切换到中文"
  );
  topNavigation!.setAttribute("aria-label", locale === "zh" ? "TAPCam 主导航" : "TAPCam navigation");
  pageProgress!.setAttribute("aria-label", locale === "zh" ? "页面章节" : "Page chapters");
  story!.setAttribute("aria-label", locale === "zh" ? "TAPCam 工作原理" : "How TAPCam works");
  pageStatus!.textContent = pageStageAnnouncements[locale][currentPageStage];
}

languageButton.addEventListener("click", () => {
  const nodeToRealign = getNodeStatePoints().findIndex(
    (point) => Math.abs(point - window.scrollY) <= 4
  );
  const nextLocale: LandingLocale = currentLocale === "zh" ? "en" : "zh";
  saveLandingLocale(nextLocale);
  applyLandingLocale(nextLocale);
  window.requestAnimationFrame(() => {
    if (nodeToRealign >= 0) {
      alignedNodeIndex = nodeToRealign;
      animateScrollTo(getNodeStatePoints()[nodeToRealign], reducedMotion.matches ? 1 : 220);
    } else {
      scheduleStoryUpdate();
    }
  });
});

applyLandingLocale(currentLocale);

const calloutDirectionPreferences: Record<SceneCalloutName, CalloutDirection[]> = {
  rgb: ["aboveLeft", "above", "left", "farAbove", "belowLeft", "right", "farBelow"],
  camera: ["above", "aboveLeft", "aboveRight", "farAbove", "left", "right", "below"],
  subject: ["aboveRight", "above", "right", "farAbove", "aboveLeft", "belowRight", "left"],
  depth: ["belowLeft", "below", "left", "farBelow", "aboveLeft", "right", "farAbove"]
};

function clampValue(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rectAround(point: CalloutPoint, radiusX: number, radiusY: number): PixelRect {
  return {
    left: point.x - radiusX,
    top: point.y - radiusY,
    right: point.x + radiusX,
    bottom: point.y + radiusY
  };
}

function expandRect(rect: PixelRect, amount: number): PixelRect {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount
  };
}

function overlapArea(first: PixelRect, second: PixelRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function calloutLabelSize(name: SceneCalloutName): { width: number; height: number } {
  const cached = sceneCalloutLabelSizes.get(name);
  if (cached) {
    return cached;
  }

  const text = sceneCallouts.get(name)?.querySelector<HTMLElement>(".scene-callout__text");
  const rect = text?.getBoundingClientRect();
  const size = {
    width: Math.max(1, Math.ceil(rect?.width ?? 1)),
    height: Math.max(1, Math.ceil(rect?.height ?? 1))
  };
  sceneCalloutLabelSizes.set(name, size);
  return size;
}

function directionalLabelRect(
  direction: CalloutDirection,
  objectRect: PixelRect,
  size: { width: number; height: number },
  gap: number
): PixelRect {
  const centerX = (objectRect.left + objectRect.right) * 0.5;
  const centerY = (objectRect.top + objectRect.bottom) * 0.5;
  let left = centerX - size.width * 0.5;
  let top = objectRect.top - gap - size.height;

  switch (direction) {
    case "aboveLeft":
      left = objectRect.left;
      break;
    case "aboveRight":
      left = objectRect.right - size.width;
      break;
    case "below":
      top = objectRect.bottom + gap;
      break;
    case "belowLeft":
      left = objectRect.left;
      top = objectRect.bottom + gap;
      break;
    case "belowRight":
      left = objectRect.right - size.width;
      top = objectRect.bottom + gap;
      break;
    case "left":
      left = objectRect.left - gap - size.width;
      top = centerY - size.height * 0.5;
      break;
    case "right":
      left = objectRect.right + gap;
      top = centerY - size.height * 0.5;
      break;
    case "farAbove":
      top = objectRect.top - gap * 3.25 - size.height;
      break;
    case "farBelow":
      top = objectRect.bottom + gap * 3.25;
      break;
    case "above":
      break;
  }

  return { left, top, right: left + size.width, bottom: top + size.height };
}

function clampLabelRect(rect: PixelRect, safeArea: PixelRect): PixelRect {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const left = clampValue(rect.left, safeArea.left, Math.max(safeArea.left, safeArea.right - width));
  const top = clampValue(rect.top, safeArea.top, Math.max(safeArea.top, safeArea.bottom - height));
  return { left, top, right: left + width, bottom: top + height };
}

function setCalloutLeader(
  name: SceneCalloutName,
  callout: HTMLElement,
  anchor: CalloutPoint,
  labelRect: PixelRect
): void {
  let connectionX = clampValue(anchor.x, labelRect.left, labelRect.right);
  let connectionY = clampValue(anchor.y, labelRect.top, labelRect.bottom);

  if (
    connectionX === anchor.x &&
    connectionY === anchor.y &&
    anchor.x >= labelRect.left &&
    anchor.x <= labelRect.right &&
    anchor.y >= labelRect.top &&
    anchor.y <= labelRect.bottom
  ) {
    const edges = [
      { distance: anchor.x - labelRect.left, x: labelRect.left, y: anchor.y },
      { distance: labelRect.right - anchor.x, x: labelRect.right, y: anchor.y },
      { distance: anchor.y - labelRect.top, x: anchor.x, y: labelRect.top },
      { distance: labelRect.bottom - anchor.y, x: anchor.x, y: labelRect.bottom }
    ].sort((first, second) => first.distance - second.distance);
    connectionX = edges[0].x;
    connectionY = edges[0].y;
  }

  const deltaX = connectionX - anchor.x;
  const deltaY = connectionY - anchor.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const perpendicularX = -deltaY / distance;
  const perpendicularY = deltaX / distance;
  const bendDirection = name === "camera" || name === "depth" ? -1 : 1;
  const bend = Math.min(11, distance * 0.12) * bendDirection;
  const elbowX = deltaX * 0.64 + perpendicularX * bend;
  const elbowY = deltaY * 0.64 + perpendicularY * bend;
  const secondX = deltaX - elbowX;
  const secondY = deltaY - elbowY;

  callout.style.setProperty("--label-x", `${(labelRect.left - anchor.x).toFixed(2)}px`);
  callout.style.setProperty("--label-y", `${(labelRect.top - anchor.y).toFixed(2)}px`);
  callout.style.setProperty("--label-transform", "none");
  callout.style.setProperty("--elbow-x", `${elbowX.toFixed(2)}px`);
  callout.style.setProperty("--elbow-y", `${elbowY.toFixed(2)}px`);
  callout.style.setProperty("--leader-one", `${Math.hypot(elbowX, elbowY).toFixed(2)}px`);
  callout.style.setProperty(
    "--leader-angle-one",
    `${(Math.atan2(elbowY, elbowX) * 180 / Math.PI).toFixed(2)}deg`
  );
  callout.style.setProperty("--leader-two", `${Math.hypot(secondX, secondY).toFixed(2)}px`);
  callout.style.setProperty(
    "--leader-angle-two",
    `${(Math.atan2(secondY, secondX) * 180 / Math.PI).toFixed(2)}deg`
  );
}

function layoutSceneCallouts(
  projectedPositions: Partial<Record<SceneCalloutName, CalloutPoint>>,
  opacity: number,
  projectedBounds: Partial<Record<SceneCalloutName, ProjectedRect>> = {}
): void {
  const width = Math.max(1, canvas!.clientWidth);
  const height = Math.max(1, canvas!.clientHeight);
  const positions = {} as Record<SceneCalloutName, CalloutPoint>;

  for (const name of sceneCalloutNames) {
    const projected = projectedPositions[name];
    if (!projected) {
      return;
    }
    positions[name] = {
      x: projected.x * width / 100,
      y: projected.y * height / 100
    };
  }

  const projectedRectToPixels = (rect: ProjectedRect): PixelRect => ({
    left: rect.left * width / 100,
    top: rect.top * height / 100,
    right: rect.right * width / 100,
    bottom: rect.bottom * height / 100
  });
  const targetRects: Record<SceneCalloutName, PixelRect> = {
    rgb: projectedBounds.rgb
      ? projectedRectToPixels(projectedBounds.rgb)
      : rectAround(
          positions.rgb,
          clampValue(width * 0.09, 54, 160),
          clampValue(height * 0.06, 42, 100)
        ),
    depth: projectedBounds.depth
      ? projectedRectToPixels(projectedBounds.depth)
      : rectAround(
          positions.depth,
          clampValue(width * 0.09, 54, 160),
          clampValue(height * 0.06, 42, 100)
        ),
    camera: rectAround(
      positions.camera,
      clampValue(width * 0.06, 35, 105),
      clampValue(height * 0.1, 52, 145)
    ),
    subject: rectAround(
      positions.subject,
      clampValue(width * 0.17, 68, 260),
      clampValue(height * 0.18, 76, 280)
    )
  };
  const depthBloomRect: PixelRect = {
    left: targetRects.depth.left,
    top: targetRects.depth.top - clampValue(height * 0.015, 8, 22),
    right: positions.depth.x + clampValue(width * 0.34, 140, 420),
    bottom: targetRects.depth.bottom + clampValue(height * 0.015, 8, 22)
  };
  const occupiedRects = [
    targetRects.rgb,
    targetRects.camera,
    targetRects.subject,
    depthBloomRect
  ].map((rect) => expandRect(rect, 7));
  const horizontalInset = clampValue(width * 0.035, 16, 48);
  const safeArea: PixelRect = {
    left: horizontalInset,
    top: clampValue(height * 0.11, 92, 132),
    right: width - horizontalInset,
    bottom: height * 0.61
  };
  const gap = clampValue(Math.min(width, height) * 0.025, 12, 28);
  const placedRects: PixelRect[] = [];

  for (const name of sceneCalloutNames) {
    const callout = sceneCallouts.get(name);
    if (!callout) {
      continue;
    }

    const size = calloutLabelSize(name);
    const candidates = calloutDirectionPreferences[name].map((direction, preferenceIndex) => {
      const rawRect = directionalLabelRect(direction, targetRects[name], size, gap);
      const rect = clampLabelRect(rawRect, safeArea);
      const paddedRect = expandRect(rect, 5);
      const boundaryAdjustment = Math.hypot(rect.left - rawRect.left, rect.top - rawRect.top);
      const objectCollision = occupiedRects.reduce(
        (total, occupiedRect) => total + overlapArea(paddedRect, occupiedRect),
        0
      );
      const labelCollision = placedRects.reduce(
        (total, placedRect) => total + overlapArea(paddedRect, placedRect),
        0
      );
      const centerX = (rect.left + rect.right) * 0.5;
      const centerY = (rect.top + rect.bottom) * 0.5;
      const leaderDistance = Math.hypot(centerX - positions[name].x, centerY - positions[name].y);
      return {
        direction,
        rect,
        score:
          objectCollision * 28 +
          labelCollision * 44 +
          boundaryAdjustment * 3 +
          preferenceIndex * 260 +
          leaderDistance * 0.12
      };
    });
    candidates.sort((first, second) => first.score - second.score);

    let selected = candidates[0];
    const previousDirection = sceneCalloutDirections.get(name);
    const previous = candidates.find((candidate) => candidate.direction === previousDirection);
    if (previous && previous.score <= selected.score + 220) {
      selected = previous;
    }

    sceneCalloutDirections.set(name, selected.direction);
    placedRects.push(expandRect(selected.rect, 9));
    callout.style.left = `${(positions[name].x / width * 100).toFixed(3)}%`;
    callout.style.top = `${(positions[name].y / height * 100).toFixed(3)}%`;
    callout.style.opacity = opacity.toFixed(3);
    setCalloutLeader(name, callout, positions[name], selected.rect);
  }
}

let scene: LandingScene | null = null;
let sceneLoading: Promise<void> | null = null;
let storyIsVisible = false;
let updateFrame = 0;
let scrollIdleTimer = 0;
let resizeAlignmentTimer = 0;
let snapAnimationFrame = 0;
let snapIsRunning = false;
let savedInlineScrollBehavior: string | null = null;
let alignedNodeIndex: number | null = null;
let progressNavigationTargetIndex: number | null = null;
let lastScrollY = window.scrollY;
let scrollDirection: ScrollDirection = 0;
let directionOriginIndex = 0;
let fullyVisibleActionStack: number[] = [];
let lastActionScrollY = window.scrollY;
let actionScrollDirection: ScrollDirection = 0;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let heroPhraseIndex = 0;
let heroCycleTimer = 0;
let heroAnimationFrame = 0;
let heroAnimationGeneration = 0;

function stopHeroScramble(): void {
  window.clearTimeout(heroCycleTimer);
  window.cancelAnimationFrame(heroAnimationFrame);
  heroCycleTimer = 0;
  heroAnimationFrame = 0;
  heroAnimationGeneration += 1;
}

function scheduleHeroScramble(): void {
  stopHeroScramble();
  const localizedHero = landingHeroCopy(currentLocale);
  const currentPhrase = localizedHero.phrases[heroPhraseIndex] ?? localizedHero.phrases[0];
  renderResolvedHeroPhrase(currentPhrase);
  setHeroAccessibleCopy(localizedHero.lead, currentPhrase);

  if (reducedMotion.matches || document.hidden || localizedHero.phrases.length < 2) {
    return;
  }

  const generation = heroAnimationGeneration;
  heroCycleTimer = window.setTimeout(() => {
    const nextIndex = (heroPhraseIndex + 7) % localizedHero.phrases.length;
    const nextPhrase = localizedHero.phrases[nextIndex];
    const startedAt = performance.now();
    const duration = 760;

    const animate = (timestamp: number): void => {
      if (generation !== heroAnimationGeneration) {
        return;
      }

      const progress = Math.min(1, (timestamp - startedAt) / duration);
      heroValue!.dataset.scrambling = progress < 1 ? "true" : "false";
      renderHeroPhrase(heroScrambleFrame(currentPhrase, nextPhrase, progress));

      if (progress < 1) {
        heroAnimationFrame = window.requestAnimationFrame(animate);
        return;
      }

      heroPhraseIndex = nextIndex;
      setHeroAccessibleCopy(localizedHero.lead, nextPhrase);
      scheduleHeroScramble();
    };

    heroAnimationFrame = window.requestAnimationFrame(animate);
  }, HERO_SCRAMBLE_HOLD_MS);
}

resetHeroScramble = () => {
  heroPhraseIndex = 0;
  scheduleHeroScramble();
};

scheduleHeroScramble();
reducedMotion.addEventListener("change", scheduleHeroScramble);
const heroParticleField = mountEmptyParticleField(heroParticles, {
  revealCats: true,
  canvasClassName: "hero-particle-canvas"
});
const heroParticleObserver = new IntersectionObserver(
  ([entry]) => heroParticleField.setActive(Boolean(entry?.isIntersecting)),
  { threshold: 0.02 }
);
heroParticleObserver.observe(heroParticles);
window.addEventListener(
  "pagehide",
  () => {
    heroParticleObserver.disconnect();
    heroParticleField.cleanup();
  },
  { once: true }
);
const CHAPTER_PROGRESS_GAP_PX = 12;
const CHAPTER_TRANSITION_RUNWAY_RATIO = 0.52;
let layoutViewportWidth = window.innerWidth;
let layoutViewportHeight = getStableViewportHeight();
const snapKeys = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " "
]);

function getStableViewportHeight(): number {
  return Math.max(1, storyStageElement!.clientHeight);
}

function getChapterTransitionRunway(): number {
  return getStableViewportHeight() * CHAPTER_TRANSITION_RUNWAY_RATIO;
}

function getProgressAnchorTop(): number {
  return Math.max(0, pageProgress!.getBoundingClientRect().top);
}

function getChapterPresentationProgresses(
  storyTop: number,
  storyDistance: number
): [number, number, number] {
  const progressTop = getProgressAnchorTop();
  const progresses = chapterCopies.map((copy) => {
    const chapter = copy.closest<HTMLElement>(".story-chapter");
    if (!chapter) {
      return 0;
    }
    const chapterRect = chapter.getBoundingClientRect();
    const chapterStyle = window.getComputedStyle(chapter);
    const copyStyle = window.getComputedStyle(copy);
    const copyTop = chapterNaturalTop(
      window.scrollY + chapterRect.bottom,
      Number.parseFloat(chapterStyle.paddingBottom) || 0,
      getChapterTransitionRunway(),
      Number.parseFloat(copyStyle.marginBottom) || 0,
      copy.offsetHeight
    );
    const desiredTop = presentationTopForCopy(
      progressTop,
      copy.offsetHeight,
      CHAPTER_PROGRESS_GAP_PX
    );
    return clamp01((copyTop - desiredTop - storyTop) / storyDistance);
  });

  return [progresses[0]!, progresses[1]!, progresses[2]!];
}

function updateChapterPanelPresentation(
  progress: number,
  entranceProgress: number
): void {
  const mobileViewport = window.matchMedia("(max-width: 780px)").matches;
  const progressTop = getProgressAnchorTop();
  const exitPoints = [
    LANDING_PANEL_TIMELINE.captureExitEnd,
    LANDING_PANEL_TIMELINE.signExitEnd,
    1
  ];
  const settledPoints = [
    LANDING_PRESENTATION_PROGRESS.capture,
    LANDING_PRESENTATION_PROGRESS.sign,
    LANDING_PRESENTATION_PROGRESS.privacy
  ];
  const entryRanges = [
    null,
    [LANDING_PANEL_TIMELINE.signEnterStart, LANDING_PANEL_TIMELINE.signEnterEnd],
    [LANDING_PANEL_TIMELINE.privacyEnterStart, LANDING_PANEL_TIMELINE.privacyEnterEnd]
  ] as const;

  chapterCopies.forEach((copy, index) => {
    const desiredTop = presentationTopForCopy(
      progressTop,
      copy.offsetHeight,
      CHAPTER_PROGRESS_GAP_PX
    );
    const deviceScale = Math.max(1, window.devicePixelRatio || 1);
    const fixedTop = mobileViewport
      ? Math.round(desiredTop * deviceScale) / deviceScale
      : desiredTop;
    const chapter = copy.closest<HTMLElement>(".story-chapter");
    const chapterRect = chapter?.getBoundingClientRect();
    const chapterStyle = chapter ? window.getComputedStyle(chapter) : null;
    const copyStyle = window.getComputedStyle(copy);
    const naturalDocumentTop = chapterRect && chapterStyle
      ? chapterNaturalTop(
          window.scrollY + chapterRect.bottom,
          Number.parseFloat(chapterStyle.paddingBottom) || 0,
          getChapterTransitionRunway(),
          Number.parseFloat(copyStyle.marginBottom) || 0,
          copy.offsetHeight
        )
      : window.scrollY + copy.getBoundingClientRect().top;
    const exitPoint = exitPoints[index] ?? 1;
    const exitOpacity = chapterPanelOpacity(
      progress,
      settledPoints[index] ?? LANDING_PRESENTATION_PROGRESS.privacy,
      exitPoint
    );
    const entryRange = entryRanges[index];
    const entryOpacity = index === 0
      ? mobileViewport
        ? chapterPanelEntryOpacity(
            entranceProgress,
            MOBILE_CAPTURE_PANEL_ENTRANCE.start,
            MOBILE_CAPTURE_PANEL_ENTRANCE.end,
            1
          )
        : 1
      : entryRange
        ? chapterPanelEntryOpacity(progress, entryRange[0], entryRange[1], 1)
        : 1;
    const opacity = exitOpacity * entryOpacity;

    const fixedTopValue = `${fixedTop}px`;
    if (copy.style.getPropertyValue("--chapter-copy-fixed-top") !== fixedTopValue) {
      copy.style.setProperty("--chapter-copy-fixed-top", fixedTopValue);
    }

    const shouldFix = naturalDocumentTop - window.scrollY <= fixedTop + 0.5 && opacity > 0.02;
    if (shouldFix && copy.dataset.panelPosition !== "fixed") {
      const naturalRect = copy.getBoundingClientRect();
      copy.style.setProperty("--chapter-copy-fixed-left", `${naturalRect.left}px`);
      copy.style.setProperty("--chapter-copy-fixed-width", `${naturalRect.width}px`);
      copy.dataset.panelPosition = "fixed";
    } else if (!shouldFix && copy.dataset.panelPosition === "fixed") {
      delete copy.dataset.panelPosition;
      copy.style.removeProperty("--chapter-copy-fixed-left");
      copy.style.removeProperty("--chapter-copy-fixed-width");
    }
    copy.style.setProperty("--chapter-copy-opacity", opacity.toFixed(4));
    copy.dataset.panelState = opacity <= 0.02
      ? "hidden"
      : opacity < 0.98
        ? "fading"
        : "visible";
  });
}

function getNodeStatePoints(): number[] {
  const storyRect = story!.getBoundingClientRect();
  const actionRect = actionSection!.getBoundingClientRect();
  const viewportHeight = getStableViewportHeight();
  const storyTop = window.scrollY + storyRect.top;
  const storyDistance = Math.max(1, storyRect.height - viewportHeight);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
  const chapterPoints = getChapterPresentationProgresses(storyTop, storyDistance)
    .map((progress) => storyTop + storyDistance * progress);

  return [
    0,
    ...chapterPoints,
    window.scrollY + actionRect.top
  ].map((point) => Math.min(maxScroll, Math.max(0, point)));
}

function restoreScrollBehavior(): void {
  if (savedInlineScrollBehavior === null) {
    return;
  }
  document.documentElement.style.scrollBehavior = savedInlineScrollBehavior;
  savedInlineScrollBehavior = null;
}

function useInstantProgrammaticScroll(): void {
  if (savedInlineScrollBehavior !== null) {
    return;
  }
  savedInlineScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
}

function stopSnapAnimation(): void {
  if (snapAnimationFrame) {
    window.cancelAnimationFrame(snapAnimationFrame);
    snapAnimationFrame = 0;
  }
  snapIsRunning = false;
  restoreScrollBehavior();
}

function cancelDirectionalSnap(clearAlignment = true): void {
  stopSnapAnimation();
  window.clearTimeout(scrollIdleTimer);
  window.clearTimeout(resizeAlignmentTimer);
  scrollIdleTimer = 0;
  resizeAlignmentTimer = 0;
  if (clearAlignment) {
    alignedNodeIndex = null;
    progressNavigationTargetIndex = null;
  }
  scrollDirection = 0;
  lastScrollY = window.scrollY;
}

function animateScrollTo(targetY: number, duration: number): void {
  stopSnapAnimation();
  const startY = window.scrollY;
  const distance = targetY - startY;
  useInstantProgrammaticScroll();

  if (Math.abs(distance) <= 2 || reducedMotion.matches) {
    window.scrollTo(0, targetY);
    restoreScrollBehavior();
    scrollDirection = 0;
    lastScrollY = window.scrollY;
    progressNavigationTargetIndex = null;
    scheduleStoryUpdate();
    return;
  }

  const startedAt = performance.now();
  snapIsRunning = true;

  const step = (now: number): void => {
    if (!snapIsRunning) {
      return;
    }

    const time = clamp01((now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - time, 3);
    window.scrollTo(0, startY + distance * eased);

    if (time < 1) {
      snapAnimationFrame = window.requestAnimationFrame(step);
      return;
    }

    snapAnimationFrame = 0;
    snapIsRunning = false;
    restoreScrollBehavior();
    scrollDirection = 0;
    lastScrollY = window.scrollY;
    progressNavigationTargetIndex = null;
    scheduleStoryUpdate();
  };

  snapAnimationFrame = window.requestAnimationFrame(step);
}

function settleDirectionalScroll(): void {
  scrollIdleTimer = 0;
  if (snapIsRunning || reducedMotion.matches || scrollDirection === 0) {
    return;
  }

  const viewportHeight = getStableViewportHeight();
  const triggerDistance =
    viewportHeight * (scrollDirection > 0 ? 0.26 : 0.38);
  const nodeStatePoints = getNodeStatePoints();
  const target = directionalSnapTarget(
    window.scrollY,
    nodeStatePoints,
    scrollDirection,
    directionOriginIndex,
    triggerDistance,
    viewportHeight * 0.08
  );

  if (target === null) {
    directionOriginIndex = pageStageIndex[currentPageStage];
    return;
  }

  const targetIndex = nodeStatePoints.findIndex((point) => Math.abs(point - target) <= 2);
  alignedNodeIndex = targetIndex >= 0 ? targetIndex : null;
  animateScrollTo(target, scrollDirection > 0 ? 380 : 520);
}

function handleScroll(): void {
  const nextScrollY = window.scrollY;
  const delta = nextScrollY - lastScrollY;

  if (!snapIsRunning && Math.abs(delta) > 1) {
    const nextDirection: ScrollDirection = delta > 0 ? 1 : -1;
    if (nextDirection !== scrollDirection) {
      scrollDirection = nextDirection;
      directionOriginIndex = pageStageIndex[currentPageStage];
    }
    window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(settleDirectionalScroll, 120);
  }

  lastScrollY = nextScrollY;
  scheduleStoryUpdate();
}

pageProgressLinks.forEach((link, index) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    cancelDirectionalSnap();
    alignedNodeIndex = index;
    progressNavigationTargetIndex = index;
    scheduleStoryUpdate();
    const target = getNodeStatePoints()[index];
    animateScrollTo(
      target,
      progressNavigationDuration(target - window.scrollY, getStableViewportHeight())
    );
    window.history.replaceState(null, "", link.hash);
  });
});

async function ensureScene(): Promise<void> {
  if (scene || sceneLoading) {
    return sceneLoading ?? Promise.resolve();
  }
  sceneLoading = import("./landingScene")
    .then(({ LandingScene: Scene }) => {
      scene = new Scene(canvas!);
      fallback!.hidden = true;
      updateStory();
      scene.setActive(storyIsVisible && !document.hidden);
    })
    .catch((error: unknown) => {
      console.warn("TAPCam landing scene could not start.", error);
      sceneLoading = null;
      fallback!.hidden = false;
      canvas!.hidden = true;
    });
  return sceneLoading;
}

function updateStory(): void {
  updateFrame = 0;
  const rect = story!.getBoundingClientRect();
  const viewportHeight = getStableViewportHeight();
  story!.style.setProperty(
    "--chapter-transition-runway",
    `${getChapterTransitionRunway()}px`
  );
  const rawProgress = storyProgressFromGeometry(rect.top, rect.height, viewportHeight);
  const storyTop = window.scrollY + rect.top;
  const storyDistance = Math.max(1, rect.height - viewportHeight);
  const progress = storyPresentationProgress(
    rawProgress,
    getChapterPresentationProgresses(storyTop, storyDistance)
  );
  const entranceProgress = storyEntranceProgressFromGeometry(rect.top, viewportHeight);
  const entranceOffset = (1 - entranceProgress) * viewportHeight * -0.4;
  story!.style.setProperty("--scene-entry-offset", `${entranceOffset}px`);
  story!.dataset.stagePinned = rect.top <= 0 ? "true" : "false";
  const stage = landingStageForProgress(progress);
  story!.dataset.stage = stage;
  story!.style.setProperty("--sign-label-opacity", signStageOpacity(progress).toFixed(4));
  story!.style.setProperty("--privacy-label-opacity", privacyStageOpacity(progress).toFixed(4));
  updateChapterPanelPresentation(progress, entranceProgress);
  updatePageProgress(rect, progress, stage);
  updateActionCardHighlights();
  scene?.setProgress(storySceneProgress(progress, entranceProgress));
}

function updateActionCardHighlights(): void {
  const mobile = window.matchMedia("(max-width: 780px)").matches;
  if (!mobile) {
    fullyVisibleActionStack = [];
    for (const link of actionLinks) {
      delete link.dataset.mobileActive;
    }
    return;
  }

  const scrollY = window.scrollY;
  const delta = scrollY - lastActionScrollY;
  if (Math.abs(delta) > 1) {
    actionScrollDirection = delta > 0 ? 1 : -1;
  }
  lastActionScrollY = scrollY;

  const topbarBottom = topNavigation!.closest<HTMLElement>(".landing-topbar")
    ?.getBoundingClientRect().bottom ?? 0;
  const progressTop = pageProgress!.getBoundingClientRect().top;
  const safeTop = topbarBottom + 8;
  const safeBottom = progressTop - 8;
  const fullyVisibleIndices = actionLinks.flatMap((link, index) => {
    const rect = link.getBoundingClientRect();
    return rect.top >= safeTop - 1 && rect.bottom <= safeBottom + 1 ? [index] : [];
  });
  fullyVisibleActionStack = updateFullyVisibleStack(
    fullyVisibleIndices,
    fullyVisibleActionStack,
    actionScrollDirection
  );
  const activeActionIndex = fullyVisibleActionStack.at(-1) ?? null;

  actionLinks.forEach((link, index) => {
    if (index === activeActionIndex) {
      link.dataset.mobileActive = "true";
    } else {
      delete link.dataset.mobileActive;
    }
  });
}

function updatePageProgress(
  storyRect: DOMRect,
  storyProgress: number,
  storyStage: LandingStage
): void {
  const viewportHeight = getStableViewportHeight();
  const storyTop = Math.max(1, window.scrollY + storyRect.top);
  const actionRect = actionSection!.getBoundingClientRect();
  let activeStage: LandingPageStage = "intro";
  let scrollCueProgress = clamp01(window.scrollY / storyTop) * 0.25;

  if (storyRect.top <= 0) {
    activeStage = storyStage;
    scrollCueProgress = 0.25 + storyProgress * 0.69;
  }

  if (actionRect.top < viewportHeight) {
    const actionApproach = clamp01(
      (viewportHeight - actionRect.top) / Math.max(1, viewportHeight * 0.55)
    );
    scrollCueProgress = Math.max(scrollCueProgress, 0.94 + actionApproach * 0.06);
  }

  if (actionRect.top <= viewportHeight * 0.48) {
    activeStage = "next";
  }

  const displayedStage = progressNavigationTargetIndex === null
    ? activeStage
    : pageStages[progressNavigationTargetIndex] ?? activeStage;
  const activeIndex = pageStageIndex[displayedStage];
  if (displayedStage !== currentPageStage) {
    pageStatus!.textContent = pageStageAnnouncements[currentLocale][displayedStage];
  }
  currentPageStage = displayedStage;
  landing!.dataset.activeSection = displayedStage;
  landing!.dataset.scrollCue = scrollCueProgress < 0.075 ? "visible" : "hidden";
  landing!.dataset.scrolled = window.scrollY > 12 ? "true" : "false";
  pageProgressLine!.style.transform = `scaleX(${progressForActiveStep(activeIndex, pageProgressLinks.length).toFixed(4)})`;

  pageProgressLinks.forEach((link, index) => {
    link.dataset.state =
      index < activeIndex ? "complete" : index === activeIndex ? "active" : "upcoming";
    if (index === activeIndex) {
      link.setAttribute("aria-current", "step");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function scheduleStoryUpdate(): void {
  if (!updateFrame) {
    updateFrame = window.requestAnimationFrame(updateStory);
  }
}

const scenePreloadObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      void ensureScene();
    }
  },
  { rootMargin: "55% 0px 55% 0px", threshold: 0 }
);

const sceneVisibilityObserver = new IntersectionObserver(
  (entries) => {
    storyIsVisible = entries.some((entry) => entry.isIntersecting);
    scene?.setActive(storyIsVisible && !document.hidden);
  },
  { threshold: 0.01 }
);

scenePreloadObserver.observe(story);
sceneVisibilityObserver.observe(story);
window.addEventListener("scroll", handleScroll, { passive: true });
window.addEventListener("wheel", () => cancelDirectionalSnap(), { passive: true });
window.addEventListener("touchstart", () => cancelDirectionalSnap(), { passive: true });
window.addEventListener("pointerdown", () => cancelDirectionalSnap(), { passive: true });
window.addEventListener("keydown", (event) => {
  if (snapKeys.has(event.key)) {
    cancelDirectionalSnap();
  }
});
window.addEventListener(
  "resize",
  () => {
    const nextViewportWidth = window.innerWidth;
    const nextViewportHeight = getStableViewportHeight();
    const layoutChanged =
      Math.abs(nextViewportWidth - layoutViewportWidth) > 1 ||
      Math.abs(nextViewportHeight - layoutViewportHeight) > 1;

    if (!layoutChanged) {
      scheduleStoryUpdate();
      return;
    }

    layoutViewportWidth = nextViewportWidth;
    layoutViewportHeight = nextViewportHeight;
    fitHeroPhrasesToSafeLine();
    chapterCopies.forEach((copy) => {
      delete copy.dataset.panelPosition;
      copy.style.removeProperty("--chapter-copy-fixed-left");
      copy.style.removeProperty("--chapter-copy-fixed-width");
    });
    sceneCalloutLabelSizes.clear();
    sceneCalloutDirections.clear();
    const nodeToRealign = alignedNodeIndex;
    cancelDirectionalSnap(false);
    window.clearTimeout(resizeAlignmentTimer);
    if (nodeToRealign !== null) {
      resizeAlignmentTimer = window.setTimeout(() => {
        resizeAlignmentTimer = 0;
        animateScrollTo(getNodeStatePoints()[nodeToRealign], reducedMotion.matches ? 1 : 220);
      }, 80);
    }
    scheduleStoryUpdate();
  },
  { passive: true }
);
window.visualViewport?.addEventListener("resize", scheduleStoryUpdate, { passive: true });
document.addEventListener("visibilitychange", () => {
  scene?.setActive(storyIsVisible && !document.hidden);
  scheduleHeroScramble();
});
canvas.addEventListener("tapcam:webgl-unavailable", () => {
  fallback.hidden = false;
});
canvas.addEventListener("tapcam:webgl-restored", () => {
  fallback.hidden = true;
  canvas.hidden = false;
});
canvas.addEventListener("tapcam:callouts", (event) => {
  const detail = (event as CustomEvent<{
    opacity: number;
    positions: Partial<Record<SceneCalloutName, CalloutPoint>>;
    bounds: Partial<Record<SceneCalloutName, ProjectedRect>>;
  }>).detail;
  layoutSceneCallouts(detail.positions, detail.opacity, detail.bounds);
});
window.addEventListener("pagehide", (event) => {
  cancelDirectionalSnap();
  stopHeroScramble();
  if (event.persisted) {
    scene?.setActive(false);
    return;
  }
  scenePreloadObserver.disconnect();
  sceneVisibilityObserver.disconnect();
  scene?.dispose();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    updateStory();
    scene?.setActive(storyIsVisible && !document.hidden);
  }
});

updateStory();

function alignHashToNode(instant = false): void {
  const nodeIndex = pageProgressLinks.findIndex((link) => link.hash === window.location.hash);
  if (nodeIndex < 0) {
    alignedNodeIndex = null;
    return;
  }

  cancelDirectionalSnap();
  alignedNodeIndex = nodeIndex;
  const target = getNodeStatePoints()[nodeIndex];
  animateScrollTo(
    target,
    instant
      ? 1
      : progressNavigationDuration(target - window.scrollY, getStableViewportHeight())
  );
}

window.addEventListener("hashchange", () => alignHashToNode());

if (pageProgressLinks.some((link) => link.hash === window.location.hash)) {
  const alignInitialHash = (): void => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => alignHashToNode(true));
    }, 120);
  };

  if (document.readyState === "complete") {
    alignInitialHash();
  } else {
    window.addEventListener("load", alignInitialHash, { once: true });
  }
}
