import { describe, expect, it } from "vitest";
import { renderTapCamTopbar } from "./topbar";

describe("renderTapCamTopbar", () => {
  it("renders the landing navigation from the shared component", () => {
    const html = renderTapCamTopbar({
      assetBase: "./",
      homeHref: "#intro",
      verifyHref: "./verify/",
      locale: "zh",
      navAriaLabel: "TAPCam 主导航",
      copyKeys: {
        verify: "nav.verifier",
        docs: "nav.docs",
        download: "nav.download"
      }
    });

    expect(html).toContain('href="./verify/"');
    expect(html).toContain('data-copy="nav.verifier"');
    expect(html).toContain("landing-topbar__link--download");
    expect(html).toContain("landing-topbar__link--docs");
    expect(html).toContain("验证器");
    expect(html).not.toContain('aria-current="page"');
    expect(html.indexOf("data-nav-download")).toBeLessThan(html.indexOf("data-nav-tool"));
    expect(html.indexOf("data-nav-tool")).toBeLessThan(html.indexOf("data-nav-doc"));
  });

  it("renders the same canonical buttons for the verifier", () => {
    const html = renderTapCamTopbar({
      assetBase: "../",
      homeHref: "../",
      verifyHref: "./",
      locale: "en",
      navAriaLabel: "TAPCam navigation",
      verifyActive: true
    });

    expect(html).toContain("data-nav-tool");
    expect(html).toContain(">VERIFIER</a>");
    expect(html).toContain('data-nav-doc>DOCS</a>');
    expect(html).toContain('data-nav-download>DOWNLOAD</a>');
    expect(html).toContain('data-nav-github aria-label="GitHub"');
    expect(html).toContain("<svg");
    expect(html).toContain('aria-current="page"');
  });
});
