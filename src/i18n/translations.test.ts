import { describe, expect, it } from "vitest";
import { translations } from "./translations";

describe("public verification claims", () => {
  it("explains file consistency without expanding the verification claim", () => {
    expect(translations.zh["onboarding.signature"]).toContain("是否与 TAPCam 签名时一致");
    expect(translations.zh["progress.captureTrusted"]).toBe("验证通过");
    expect(translations.en["onboarding.signature"]).toContain("file matches what TAPCam signed");
    expect(translations.en["progress.captureTrusted"]).toBe("Verification passed");
  });

  it("keeps scene, authorship, AI-origin, and depth correctness outside the claim", () => {
    expect(translations.zh["onboarding.signature"]).toMatch(/不能证明拍摄场景、作者身份.*不能判断是否使用了 AI/);
    expect(translations.zh["onboarding.depth"]).toContain("不证明物理场景或深度正确");
    expect(translations.en["onboarding.signature"]).toMatch(/does not prove the scene or author.*identity.*determine whether AI was used/);
    expect(translations.en["onboarding.depth"]).toContain("does not prove the physical scene or depth correctness");
  });
});
