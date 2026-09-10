import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectTapVideoDepth, decodeTapDepthFrame, renderTapDepthFrame } from "./tapVideo";
import { mountTapVideoDepthPlayback } from "./videoPlayback";

vi.mock("./tapVideo", () => ({
  inspectTapVideoDepth: vi.fn(),
  decodeTapDepthFrame: vi.fn(),
  renderTapDepthFrame: vi.fn()
}));

function mount() {
  const status = { textContent: "", classList: { add: vi.fn(), remove: vi.fn() } };
  const metadata = { textContent: "" };
  const video = { currentTime: 0, paused: true, ended: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const cleanup = mountTapVideoDepthPlayback(video as unknown as HTMLVideoElement, {} as HTMLCanvasElement, status as unknown as HTMLElement, metadata as unknown as HTMLElement, new Uint8Array());
  return { status, metadata, cleanup };
}

beforeEach(() => vi.resetAllMocks());

describe("video depth status", () => {
  it("keeps a zero-depth video playable without technical placeholders", () => {
    vi.mocked(inspectTapVideoDepth).mockReturnValue({ manifest: { payload: { depthCoverage: { format: null } } }, depthFrames: [] } as unknown as ReturnType<typeof inspectTapVideoDepth>);
    const view = mount();
    expect(view.status.textContent).toBe("This video has no depth view and can play normally.");
    expect(view.metadata.textContent).toBe("");
    view.cleanup();
  });

  it("shows recovery copy and logs only the failure stage and type", () => {
    vi.mocked(inspectTapVideoDepth).mockImplementation(() => { throw new Error("private-key private-assertion raw-bytes"); });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const view = mount();
    expect(view.status.textContent).toBe("The depth view is unavailable. You can still play the video.");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-key|private-assertion|raw-bytes/);
    expect(log).toHaveBeenCalledWith("TAP video depth inspection failed", { errorType: "Error" });
    view.cleanup();
    log.mockRestore();
  });

  it("keeps useful playback time and size without exposing codec or transform tokens", async () => {
    vi.mocked(inspectTapVideoDepth).mockReturnValue({ manifest: { payload: { depthCoverage: { format: { width: 2, height: 1, pixelFormat: "hdep" } }, rgbTrack: { transform: "rotation:90;mirrored" } } }, depthFrames: [{ frameIndex: 0, presentationTimeSeconds: 0 }] } as unknown as ReturnType<typeof inspectTapVideoDepth>);
    vi.mocked(decodeTapDepthFrame).mockResolvedValue(new Uint8Array());
    vi.mocked(renderTapDepthFrame).mockReturnValue({ min: 1, max: 2 });
    const view = mount();
    await vi.waitFor(() => expect(view.status.textContent).toBe("Depth view · 0:00.000"));
    expect(view.metadata.textContent).toBe("2 × 1");
    expect(view.status.textContent + view.metadata.textContent).not.toMatch(/hdep|rotation|mirrored/);
    view.cleanup();
  });
});
