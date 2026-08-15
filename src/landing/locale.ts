export type LandingLocale = "zh" | "en";

export type LandingCopyKey =
  | "skip"
  | "hero.title"
  | "hero.body"
  | "capture.title"
  | "capture.body"
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

const copy: Record<LandingLocale, Record<LandingCopyKey, string>> = {
  zh: {
    skip: "跳到产品原理",
    "hero.title": "让媒体带着<br />拍摄凭证离开相机。",
    "hero.body":
      "媒体一旦离开拍摄设备，来源、完整性与空间上下文往往无法一起核验。TAPCam 将媒体内容、深度数据和由 App Attest 支持的采集凭证绑定在同一次捕获中，让原始文件仍能被独立检查。",
    "capture.title": "画面在右，<br />照片与深度在左。",
    "capture.body":
      "两个镜头构成 RGB 与深度捕获层的视觉意象：右侧是被摄对象，左侧同时形成照片和深度表达。",
    "sign.title": "数据包，<br />在离开相机前被绑定。",
    "sign.body":
      "媒体、深度、清单与证明材料依次汇合；内容绑定与签名把这些资源固定在同一次捕获中。",
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
    "hero.title": "Let media leave the camera<br />with its capture proof.",
    "hero.body":
      "Once media leaves the capture device, its origin, integrity, and spatial context rarely remain verifiable together. TAPCam binds media, depth data, and App Attest-backed capture evidence in one capture so the original file can still be independently inspected.",
    "capture.title": "Subject on the right.<br />Photo and depth on the left.",
    "capture.body":
      "Two lenses express the RGB and depth capture layers: the subject stays on the right while the photo and its depth representation form together on the left.",
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

