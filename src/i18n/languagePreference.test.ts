import { describe, expect, it } from "vitest";
import { resolveLanguagePreference } from "./languagePreference";

describe("language preference", () => {
  it("prefers a saved language over the browser language", () => {
    expect(resolveLanguagePreference("en", ["zh-CN"])).toBe("en");
    expect(resolveLanguagePreference("zh", ["en-US"])).toBe("zh");
  });

  it("falls back to the browser language", () => {
    expect(resolveLanguagePreference(null, ["ja-JP", "zh-Hans"])).toBe("zh");
    expect(resolveLanguagePreference(null, ["en-US"])).toBe("en");
  });
});
