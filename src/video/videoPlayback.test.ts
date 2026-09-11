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
  return { status, metadata, video, cleanup };
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
    const registration = { status: "registered", descriptor: { connectionTransform: "rotation:90;mirrored" } };
    vi.mocked(inspectTapVideoDepth).mockReturnValue({ manifest: { payload: { depthCoverage: { format: { width: 2, height: 1, pixelFormat: "hdep" } }, rgbTrack: { transform: "rotation:90;mirrored" }, spatialRegistration: registration } }, depthFrames: [{ frameIndex: 0, presentationTimeSeconds: 0 }] } as unknown as ReturnType<typeof inspectTapVideoDepth>);
    vi.mocked(decodeTapDepthFrame).mockResolvedValue(new Uint8Array());
    vi.mocked(renderTapDepthFrame).mockReturnValue({ min: 1, max: 2 });
    const view = mount();
    await vi.waitFor(() => expect(view.status.textContent).toBe("Depth view · 0:00.000"));
    expect(view.metadata.textContent).toBe("2 × 1");
    expect(renderTapDepthFrame).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(Object), expect.any(Object), "rotation:90;mirrored", registration);
    expect(view.status.textContent + view.metadata.textContent).not.toMatch(/hdep|rotation|mirrored/);
    view.cleanup();
  });
  it("selects unsorted samples with duplicate timestamps and caches each sample independently", async () => {
    const frames = [
      { frameIndex: 7, presentationTimeSeconds: 2, payload: new Uint8Array([2]) },
      { frameIndex: 7, presentationTimeSeconds: 0, payload: new Uint8Array([0]) },
      { frameIndex: 7, presentationTimeSeconds: 0, payload: new Uint8Array([9]) },
      { frameIndex: 1, presentationTimeSeconds: 1, payload: new Uint8Array([1]) }
    ];
    vi.mocked(inspectTapVideoDepth).mockReturnValue({ manifest: { payload: { depthCoverage: { format: { width: 2, height: 1 } } } }, depthFrames: frames } as unknown as ReturnType<typeof inspectTapVideoDepth>);
    vi.mocked(decodeTapDepthFrame).mockImplementation(async (frame) => frame.payload);
    vi.mocked(renderTapDepthFrame).mockReturnValue({ min: 0, max: 2 });
    const view = mount();
    await vi.waitFor(() => expect(renderTapDepthFrame).toHaveBeenCalledTimes(1));
    expect(vi.mocked(renderTapDepthFrame).mock.calls[0][0]).toEqual(new Uint8Array([0]));
    const update = view.video.addEventListener.mock.calls.find(([name]) => name === "timeupdate")![1] as () => void;
    view.video.currentTime = 2;
    update();
    await vi.waitFor(() => expect(renderTapDepthFrame).toHaveBeenCalledTimes(2));
    expect(vi.mocked(renderTapDepthFrame).mock.calls[1][0]).toEqual(new Uint8Array([2]));
    view.video.currentTime = 0;
    update();
    await vi.waitFor(() => expect(renderTapDepthFrame).toHaveBeenCalledTimes(3));
    expect(vi.mocked(renderTapDepthFrame).mock.calls[2][0]).toEqual(new Uint8Array([0]));
    expect(decodeTapDepthFrame).toHaveBeenCalledTimes(2);
    expect(frames.map((frame) => frame.presentationTimeSeconds)).toEqual([2, 0, 0, 1]);
    view.cleanup();
  });

});
