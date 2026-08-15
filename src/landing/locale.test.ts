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

  it("keeps the future privacy boundary explicit in both languages", () => {
    expect(landingCopy("zh", "privacy.body")).toContain("研发方向");
    expect(landingCopy("en", "privacy.body")).toContain("R&D");
  });

  it("switches capture copy and callouts as single-language strings", () => {
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
      "我们使用苹果的 App Attest 技术来保证软件的安全性，从而确保每个人的拍摄都可以被验证。"
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
