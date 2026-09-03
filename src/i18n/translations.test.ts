import { describe, expect, it } from "vitest";
import { translations } from "./translations";

describe("public verification claims", () => {
  it("states the positive claim as registered-credential and declared-byte binding", () => {
    expect(translations.zh["onboarding.signature"]).toContain("明确资源字节");
    expect(translations.zh["progress.captureTrusted"]).toBe("签名与内容绑定通过");
    expect(translations.en["onboarding.signature"]).toContain("registered credential");
    expect(translations.en["progress.captureTrusted"]).toBe("Signature and content binding passed");
  });

  it("keeps scene, authorship, AI-origin, and depth correctness outside the claim", () => {
    expect(translations.zh["onboarding.signature"]).toContain("不证明场景、作者或非 AI 来源");
    expect(translations.zh["onboarding.depth"]).toContain("不证明物理场景或深度正确");
    expect(translations.en["onboarding.signature"]).toContain("do not prove the scene, author, or non-AI origin");
    expect(translations.en["onboarding.depth"]).toContain("does not prove the physical scene or depth correctness");
  });
});
