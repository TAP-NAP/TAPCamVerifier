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

  it("keeps the local-media and explicit-boundary message aligned in both languages", () => {
    expect(landingCopy("zh", "privacy.title")).toBe(
      "验证边界，<br />应当清晰可查。"
    );
    expect(landingCopy("zh", "privacy.body")).toContain("原始媒体留在浏览器本地");
    expect(landingCopy("zh", "privacy.body")).toContain("尚未实现的隐私能力不会作为当前保证");
    expect(landingCopy("zh", "privacy.tagsLabel")).toBe("验证原则与当前边界");

    expect(landingCopy("en", "privacy.title")).toBe(
      "Verification boundaries <br />should be inspectable."
    );
    expect(landingCopy("en", "privacy.body")).toContain("Original media stays in the browser");
    expect(landingCopy("en", "privacy.body")).toContain("unimplemented privacy features");
    expect(landingCopy("en", "privacy.tagsLabel")).toBe(
      "Verification principles and current boundaries"
    );
  });

  it("switches capture copy and callouts as single-language strings", () => {
    expect(landingCopy("zh", "hero.body")).toContain("明确资源字节与签名绑定是否一致");
    expect(landingCopy("zh", "hero.body")).toContain("不证明真实场景、作者身份或非 AI 来源");
    expect(landingCopy("en", "hero.body")).toContain("declared resource bytes match the signed binding");
    expect(landingCopy("en", "hero.body")).toContain("does not prove a real scene, authorship, or non-AI origin");
    expect(landingCopy("zh", "capture.title")).toBe("捕捉色彩，<br />记录纵深。");
    expect(landingCopy("zh", "capture.body")).toContain("明确的资源集合纳入内容绑定");
    expect(landingCopy("zh", "capture.body")).toContain("不证明物理场景或深度本身正确");
    expect(landingCopy("zh", "callout.rgb")).toBe("RGB 图像");
    expect(landingCopy("zh", "callout.depth")).toBe("深度数据");
    expect(landingCopy("zh", "callout.camera")).toBe("空间相机");
    expect(landingCopy("zh", "callout.subject")).toBe("被摄对象");

    expect(landingCopy("en", "capture.title")).toBe("Capture color. <br />Record depth.");
    expect(landingCopy("en", "capture.body")).toContain("declared resource set in its content binding");
    expect(landingCopy("en", "capture.body")).toContain("does not prove the physical scene or depth correctness");
    expect(landingCopy("en", "callout.rgb")).toBe("RGB IMAGE");
    expect(landingCopy("en", "callout.depth")).toBe("DEPTH DATA");
    expect(landingCopy("en", "callout.camera")).toBe("SPATIAL CAMERA");
    expect(landingCopy("en", "callout.subject")).toBe("SUBJECT");
  });

  it("describes signing as credential and byte binding in both languages", () => {
    expect(landingCopy("zh", "sign.title")).toBe(
      "凭证绑定，<br />可被独立检查。"
    );
    expect(landingCopy("zh", "sign.body")).toBe(
      "TAPCam 使用 Apple App Attest 生成签名凭证，把媒体、深度可用性与明确资源集合纳入同一内容绑定；验证器检查收到的字节是否与该绑定一致。"
    );
    expect(landingCopy("en", "sign.title")).toBe(
      "Credential binding, <br />independently inspectable."
    );
    expect(landingCopy("en", "sign.body")).toBe(
      "TAPCam uses Apple App Attest to create a signing credential that covers media, depth availability, and the declared resource set in one content binding; the verifier checks received bytes against that binding."
    );
  });

  it("offers every approved Chinese hero phrase combination", () => {
    const hero = landingHeroCopy("zh");

    expect(hero.lead).toBe("在 AI 时代，记录");
    expect(hero.phrases).toHaveLength(10);
    expect(hero.phrases[0]).toBe("我们的生活");
    expect(hero.phrases).toContain("我们的瞬间");
    expect(hero.phrases).toContain("有凭证的影像");
    expect(hero.phrases).toContain("可验证的视频");
    expect(hero.phrases).toContain("可检查的字节");
  });
});
