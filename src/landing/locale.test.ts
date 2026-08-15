import { describe, expect, it } from "vitest";
import { landingCopy, landingHeroCopy, resolveLandingLocale } from "./locale";

describe("landing locale", () => {
  it("prefers an explicit saved locale", () => {
    expect(resolveLandingLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLandingLocale("zh", ["en-US"])).toBe("zh");
  });

  it("falls back to the browser language", () => {
    expect(resolveLandingLocale(null, ["ja-JP", "zh-Hans"])).toBe("zh");
    expect(resolveLandingLocale(null, ["en-US"])).toBe("en");
  });

  it("keeps the open-source and future-ZKP message aligned in both languages", () => {
    expect(landingCopy("zh", "privacy.title")).toBe(
      "证明及验证，<br />是基本权利。"
    );
    expect(landingCopy("zh", "privacy.body")).toContain("软件完全开源（在正式版上架后）");
    expect(landingCopy("zh", "privacy.body")).toContain("证明自己是作者本人是一项基本权利");
    expect(landingCopy("zh", "privacy.body")).toContain("引入 ZKP 技术");
    expect(landingCopy("zh", "privacy.tagsLabel")).toBe("验证原则与后续能力");

    expect(landingCopy("en", "privacy.title")).toBe(
      "Proof and verification <br />are fundamental rights."
    );
    expect(landingCopy("en", "privacy.body")).toContain("fully open source after the official release");
    expect(landingCopy("en", "privacy.body")).toContain("original author is a fundamental right");
    expect(landingCopy("en", "privacy.body")).toContain("introduce ZKP technology");
    expect(landingCopy("en", "privacy.tagsLabel")).toBe(
      "Verification principles and upcoming capability"
    );
  });

  it("switches capture copy and callouts as single-language strings", () => {
    expect(landingCopy("zh", "hero.body")).toBe(
      "AI 时代下，摄影还有价值吗？<br />在充斥着 AI 内容的当下，我们如何让真实的内容被看见？<br />正如摄影不会替代绘画，而 AI 生图也无法取代摄影。<br />TAPCam 就是这样一款帮助你记录的摄影软件，让你的感受、表达在 AI 时代也能被看见。"
    );
    expect(landingCopy("en", "hero.body")).toContain(
      "AI-generated images cannot replace photography"
    );
    expect(landingCopy("zh", "capture.title")).toBe("捕捉色彩，<br />记录纵深。");
    expect(landingCopy("zh", "capture.body")).toContain("更是一台空间相机");
    expect(landingCopy("zh", "callout.rgb")).toBe("RGB 图像");
    expect(landingCopy("zh", "callout.depth")).toBe("深度数据");
    expect(landingCopy("zh", "callout.camera")).toBe("空间相机");
    expect(landingCopy("zh", "callout.subject")).toBe("被摄对象");

    expect(landingCopy("en", "capture.title")).toBe("Capture color. <br />Record depth.");
    expect(landingCopy("en", "capture.body")).toContain("it is a spatial camera");
    expect(landingCopy("en", "callout.rgb")).toBe("RGB IMAGE");
    expect(landingCopy("en", "callout.depth")).toBe("DEPTH DATA");
    expect(landingCopy("en", "callout.camera")).toBe("SPATIAL CAMERA");
    expect(landingCopy("en", "callout.subject")).toBe("SUBJECT");
  });

  it("keeps the approved Chinese signing message and punctuation", () => {
    expect(landingCopy("zh", "sign.title")).toBe(
      "安全，<br />保证创作的真实性。"
    );
    expect(landingCopy("zh", "sign.body")).toBe(
      "我们使用苹果的 App Attest 技术；我们把影像数据、深度数据、可验证凭证绑定在一起，从而确保每个人的拍摄都可以被验证。"
    );
    expect(landingCopy("en", "sign.title")).toBe(
      "Security ensures <br />creative authenticity."
    );
    expect(landingCopy("en", "sign.body")).toBe(
      "We use Apple's App Attest technology to bind image data, depth data, and verifiable credentials together so every capture can be verified."
    );
  });

  it("offers every approved Chinese hero phrase combination", () => {
    const hero = landingHeroCopy("zh");

    expect(hero.lead).toBe("在 AI 时代，记录");
    expect(hero.phrases).toHaveLength(20);
    expect(hero.phrases[0]).toBe("我们的生活");
    expect(hero.phrases).toContain("我们的瞬间");
    expect(hero.phrases).toContain("真实的生活");
    expect(hero.phrases).toContain("不可篡改的新闻");
    expect(hero.phrases).toContain("可验的瞬间");
  });
});
