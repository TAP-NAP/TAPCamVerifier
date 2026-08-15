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
      "媒体一旦离开拍摄设备，来源、完整性与空间上下文往往无法一起核验。TAPCam 将媒体内容、深度数据和由 App Attest 支持的采集凭证绑定在同一次捕获中，让原始文件仍能被独立检查。",
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
    "privacy.title": "验证属于每个人，<br />隐私仍属于你。",
    "privacy.body":
      "浏览器先执行本地内容绑定检查，再把证明材料交给明确的服务器验证边界。去中心化验证与零知识隐私证明是下一阶段研发方向。",
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
      "Once media leaves the capture device, its origin, integrity, and spatial context rarely remain verifiable together. TAPCam binds media, depth data, and App Attest-backed capture evidence in one capture so the original file can still be independently inspected.",
    "capture.title": "Capture color. <br />Record depth.",
    "capture.body":
      "TAPCam is more than a camera—it is a spatial camera. We use this technology to record the environment around a captured photo, helping ensure that the content comes from a real scene.",
    "callout.rgb": "RGB IMAGE",
    "callout.depth": "DEPTH DATA",
    "callout.camera": "SPATIAL CAMERA",
    "callout.subject": "SUBJECT",
    "sign.title": "The package is bound<br />before it leaves the camera.",
    "sign.body":
      "Media, depth, manifest, and proof material converge in sequence. Content binding and signing fix those resources to the same capture.",
    "privacy.title": "Verification belongs to everyone.<br />Privacy stays yours.",
    "privacy.body":
      "The browser performs local content-binding checks before proof material crosses a clearly defined server-verification boundary. Decentralized verification and zero-knowledge privacy proofs remain next-stage R&D.",
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
