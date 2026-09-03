import {
  getPreferredLanguage,
  resolveLanguagePreference,
  saveLanguagePreference
} from "../i18n/languagePreference";

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
  | "action.docs.body";

const zhHeroPhrases = [
  "我们的生活",
  "我们的影像",
  "我们的回忆",
  "我们的瞬间",
  "有凭证的影像",
  "有凭证的记录",
  "可验证的照片",
  "可验证的视频",
  "被绑定的资源",
  "可检查的字节"
];

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
      "our images",
      "our memories",
      "our moments",
      "credentialed images",
      "credentialed records",
      "verifiable photos",
      "verifiable videos",
      "bound resources",
      "inspectable bytes"
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
      "AI 时代下，摄影仍然承载感受与表达。<br />TAPCam 将相机采集的媒体与设备凭证绑定，让接收者可以检查签名以及明确资源字节与签名绑定是否一致。<br />验证结果不证明真实场景、作者身份或非 AI 来源。",
    "capture.title": "捕捉色彩，<br />记录纵深。",
    "capture.body":
      "TAPCam 同时记录影像与设备提供的深度数据，并把明确的资源集合纳入内容绑定。深度用于可视化，不证明物理场景或深度本身正确。",
    "callout.rgb": "RGB 图像",
    "callout.depth": "深度数据",
    "callout.camera": "空间相机",
    "callout.subject": "被摄对象",
    "sign.title": "凭证绑定，<br />可被独立检查。",
    "sign.body":
      "TAPCam 使用 Apple App Attest 生成签名凭证，把媒体、深度可用性与明确资源集合纳入同一内容绑定；验证器检查收到的字节是否与该绑定一致。",
    "privacy.title": "验证边界，<br />应当清晰可查。",
    "privacy.body":
      "原始媒体留在浏览器本地，服务器只接收签名验证材料。公开的实现与协议让验证范围可以被检查；尚未实现的隐私能力不会作为当前保证。",
    "privacy.tagsLabel": "验证原则与当前边界",
    "action.title": "从现在开始，记录当下。",
    "action.download.title": "下载 TAPCam",
    "action.download.body": "现在参与 TestFlight 进行测试",
    "action.verify.title": "打开验证器",
    "action.verify.body": "检查 TAPCam 媒体的签名凭证与内容绑定",
    "action.docs.title": "阅读技术文档",
    "action.docs.body": "了解协议、数据边界与验证流程"
  },
  en: {
    skip: "Skip to how TAPCam works",
    "nav.verifier": "VERIFIER",
    "nav.docs": "DOCS",
    "nav.download": "DOWNLOAD",
    "hero.title": "In the age of AI, record<br />our life",
    "hero.body":
      "Photography still carries feeling and expression in the age of AI.<br />TAPCam binds camera-captured media to a device credential so recipients can check the signature and whether the declared resource bytes match the signed binding.<br />Verification does not prove a real scene, authorship, or non-AI origin.",
    "capture.title": "Capture color. <br />Record depth.",
    "capture.body":
      "TAPCam records images alongside device-provided depth data and includes the declared resource set in its content binding. Depth supports visualization; it does not prove the physical scene or depth correctness.",
    "callout.rgb": "RGB IMAGE",
    "callout.depth": "DEPTH DATA",
    "callout.camera": "SPATIAL CAMERA",
    "callout.subject": "SUBJECT",
    "sign.title": "Credential binding, <br />independently inspectable.",
    "sign.body":
      "TAPCam uses Apple App Attest to create a signing credential that covers media, depth availability, and the declared resource set in one content binding; the verifier checks received bytes against that binding.",
    "privacy.title": "Verification boundaries <br />should be inspectable.",
    "privacy.body":
      "Original media stays in the browser; the server receives only signature-verification material. Published implementation and protocols make the scope inspectable, while unimplemented privacy features are not presented as current guarantees.",
    "privacy.tagsLabel": "Verification principles and current boundaries",
    "action.title": "Start now. Capture the moment.",
    "action.download.title": "Download TAPCam",
    "action.download.body": "Join the TestFlight beta now",
    "action.verify.title": "Open the verifier",
    "action.verify.body": "Check TAPCam media credentials and content binding",
    "action.docs.title": "Read the technology docs",
    "action.docs.body": "Understand the protocol, data boundaries, and verification flow"
  }
};

export function resolveLandingLocale(
  storedLocale: string | null,
  browserLanguages: readonly string[]
): LandingLocale {
  return resolveLanguagePreference(storedLocale, browserLanguages);
}

export function getInitialLandingLocale(): LandingLocale {
  return getPreferredLanguage();
}

export function saveLandingLocale(locale: LandingLocale): void {
  saveLanguagePreference(locale);
}

export function landingCopy(locale: LandingLocale, key: LandingCopyKey): string {
  return copy[locale][key];
}

export function landingHeroCopy(locale: LandingLocale): LandingHeroCopy {
  return heroCopy[locale];
}
