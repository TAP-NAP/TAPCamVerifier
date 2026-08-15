export type LandingLocale = "zh" | "en";

export type LandingHeroCopy = {
  lead: string;
  leadParts: readonly [string, string];
  phrases: readonly string[];
};

export type LandingCopyKey =
  | "skip"
  | "nav.verifier"
  | "nav.docs"
  | "nav.download"
  | "hero.title"
  | "hero.body"
  | "capture.title"
  | "capture.body"
  | "callout.rgb"
  | "callout.depth"
  | "callout.camera"
  | "callout.subject"
  | "sign.title"
  | "sign.body"
  | "privacy.title"
  | "privacy.body"
  | "privacy.tagsLabel"
  | "action.title"
  | "action.download.title"
  | "action.download.body"
  | "action.verify.title"
  | "action.verify.body"
  | "action.docs.title"
  | "action.docs.body"
  | "scrollCue";

const LANDING_LANGUAGE_STORAGE_KEY = "tapcam.landing.lang";

const zhHeroPhrases = ["我们的", "真实的", "不可篡改的", "可验的"].flatMap((descriptor) =>
  ["生活", "影像", "新闻", "回忆", "瞬间"].map((subject) => `${descriptor}${subject}`)
);

const heroCopy: Record<LandingLocale, LandingHeroCopy> = {
  zh: {
    lead: "在 AI 时代，记录",
    leadParts: ["在 AI 时代，", "记录"],
    phrases: zhHeroPhrases
  },
  en: {
    lead: "In the age of AI, record",
    leadParts: ["In the age of AI,", "record"],
    phrases: [
      "our life",
      "real life",
      "unaltered images",
      "verifiable news",
      "real memories",
      "verifiable moments"
    ]
  }
};

const copy: Record<LandingLocale, Record<LandingCopyKey, string>> = {
  zh: {
    skip: "跳到产品原理",
    "nav.verifier": "验证器",
    "nav.docs": "文档",
    "nav.download": "下载",
    "hero.title": "在 AI 时代，记录<br />我们的生活",
    "hero.body":
      "AI 时代下，摄影还有价值吗？<br />在充斥着 AI 内容的当下，我们如何让真实的内容被看见？<br />正如摄影不会替代绘画，而 AI 生图也无法取代摄影。<br />TAPCam 就是这样一款帮助你记录的摄影软件，让你的感受、表达在 AI 时代也能被看见。",
    "capture.title": "捕捉色彩，<br />记录纵深。",
    "capture.body":
      "TAPCam 不仅仅是一台相机，更是一台空间相机。我们利用此技术来记录被拍摄的照片的环境。从而确保我们所拍摄的内容是取自一个真实场景。",
    "callout.rgb": "RGB 图像",
    "callout.depth": "深度数据",
    "callout.camera": "空间相机",
    "callout.subject": "被摄对象",
    "sign.title": "安全，<br />保证创作的真实性。",
    "sign.body":
      "我们使用苹果的 App Attest 技术来保证软件的安全性，从而确保每个人的拍摄都可以被验证。",
    "privacy.title": "证明及验证，<br />是基本权利。",
    "privacy.body":
      "软件完全开源（在正式版上架后），因为我们认为，在 AI 时代下，证明自己是作者本人是一项基本权利。同时，我们欢迎更多人加入来进行维护。未来会引入 ZKP 技术，以提供更好的匿名性。",
    "privacy.tagsLabel": "验证原则与后续能力",
    "action.title": "拍摄、验证，或者继续读下去。",
    "action.download.title": "下载 TAPCam",
    "action.download.body": "通过 TestFlight 体验捕获流程",
    "action.verify.title": "打开验证器",
    "action.verify.body": "验证原始 TAPCam 照片与视频",
    "action.docs.title": "阅读技术文档",
    "action.docs.body": "了解协议、数据边界与验证流程",
    scrollCue: "继续向下探索"
  },
  en: {
    skip: "Skip to how TAPCam works",
    "nav.verifier": "VERIFIER",
    "nav.docs": "DOCS",
    "nav.download": "DOWNLOAD",
    "hero.title": "In the age of AI, record<br />our life",
    "hero.body":
      "Does photography still matter in the age of AI?<br />In a world saturated with AI-generated content, how can authentic work still be seen?<br />Photography did not replace painting, and AI-generated images cannot replace photography.<br />TAPCam is a photography app built to help you record, so your feelings and expression can still be seen in the age of AI.",
    "capture.title": "Capture color. <br />Record depth.",
    "capture.body":
      "TAPCam is more than a camera—it is a spatial camera. We use this technology to record the environment around a captured photo, helping ensure that the content comes from a real scene.",
    "callout.rgb": "RGB IMAGE",
    "callout.depth": "DEPTH DATA",
    "callout.camera": "SPATIAL CAMERA",
    "callout.subject": "SUBJECT",
    "sign.title": "Security ensures <br />creative authenticity.",
    "sign.body":
      "We use Apple's App Attest technology to secure the software so every capture can be verified.",
    "privacy.title": "Proof and verification <br />are fundamental rights.",
    "privacy.body":
      "The software will be fully open source after the official release because we believe that, in the AI era, proving that you are the original author is a fundamental right. We welcome more people to help maintain it, and plan to introduce ZKP technology to provide stronger anonymity.",
    "privacy.tagsLabel": "Verification principles and upcoming capability",
    "action.title": "Capture, verify, or keep reading.",
    "action.download.title": "Download TAPCam",
    "action.download.body": "Experience the capture flow through TestFlight",
    "action.verify.title": "Open the verifier",
    "action.verify.body": "Verify original TAPCam photos and videos",
    "action.docs.title": "Read the technology docs",
    "action.docs.body": "Understand the protocol, data boundaries, and verification flow",
    scrollCue: "Scroll to explore"
  }
};

export function resolveLandingLocale(
  storedLocale: string | null,
  browserLanguages: readonly string[]
): LandingLocale {
  if (storedLocale === "zh" || storedLocale === "en") {
    return storedLocale;
  }

  return browserLanguages.some((language) => language.toLowerCase().startsWith("zh"))
    ? "zh"
    : "en";
}

export function getInitialLandingLocale(): LandingLocale {
  let storedLocale: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(LANDING_LANGUAGE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }

  return resolveLandingLocale(storedLocale, navigator.languages ?? [navigator.language]);
}

export function saveLandingLocale(locale: LandingLocale): void {
  try {
    window.localStorage.setItem(LANDING_LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // The language still changes for this page even when persistence is unavailable.
  }
}

export function landingCopy(locale: LandingLocale, key: LandingCopyKey): string {
  return copy[locale][key];
}

export function landingHeroCopy(locale: LandingLocale): LandingHeroCopy {
  return heroCopy[locale];
}
