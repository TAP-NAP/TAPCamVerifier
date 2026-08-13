import {
  decodeTapDepthFrame,
  inspectTapVideoDepth,
  renderTapDepthFrame,
  type TapVideoDepthFrame
} from "./tapVideo";

export interface TapVideoPlaybackCleanup {
  (): void;
}

export function mountTapVideoDepthPlayback(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  status: HTMLElement,
  metadata: HTMLElement,
  videoBytes: Uint8Array
): TapVideoPlaybackCleanup {
  let disposed = false;
  let renderGeneration = 0;
  let renderedFrameIndex = -1;
  let callbackHandle = 0;
  const decodedCache = new Map<number, Uint8Array>();

  let inspection: ReturnType<typeof inspectTapVideoDepth>;
  try {
    inspection = inspectTapVideoDepth(videoBytes);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.classList.add("is-error");
    return () => {
      disposed = true;
    };
  }

  const format = inspection.manifest.payload.depthCoverage.format;
  const frames = inspection.depthFrames;
  if (!format || frames.length === 0) {
    status.textContent = "该 TAP Video 没有存储深度帧；视频仍可正常播放。";
    metadata.textContent = "0 depth frames";
    return () => {
      disposed = true;
    };
  }

  status.textContent = "等待视频播放位置…";
  metadata.textContent = `${frames.length} frames · ${format.width} × ${format.height} · ${format.pixelFormat}`;

  const renderAtCurrentTime = (): void => {
    if (disposed) return;
    const frame = nearestFrame(frames, video.currentTime);
    if (!frame || frame.frameIndex === renderedFrameIndex) return;
    const generation = ++renderGeneration;
    void decodedFrame(frame).then((decoded) => {
      if (disposed || generation !== renderGeneration) return;
      const range = renderTapDepthFrame(decoded, format, canvas);
      renderedFrameIndex = frame.frameIndex;
      status.textContent = `深度帧 ${frame.frameIndex} · ${formatTime(frame.presentationTimeSeconds)} · ${format.kind} ${formatNumber(range.min)}–${formatNumber(range.max)}`;
      status.classList.remove("is-error");
    }).catch((error) => {
      if (disposed || generation !== renderGeneration) return;
      status.textContent = error instanceof Error ? error.message : String(error);
      status.classList.add("is-error");
    });
  };

  const decodedFrame = async (frame: TapVideoDepthFrame): Promise<Uint8Array> => {
    const cached = decodedCache.get(frame.frameIndex);
    if (cached) return cached;
    const decoded = await decodeTapDepthFrame(frame);
    decodedCache.set(frame.frameIndex, decoded);
    while (decodedCache.size > 2) {
      const oldest = decodedCache.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      decodedCache.delete(oldest);
    }
    return decoded;
  };

  const scheduleVideoFrame = (): void => {
    if (disposed || video.paused || video.ended || !("requestVideoFrameCallback" in video)) return;
    callbackHandle = video.requestVideoFrameCallback(() => {
      renderAtCurrentTime();
      scheduleVideoFrame();
    });
  };

  const onPlay = (): void => {
    renderAtCurrentTime();
    scheduleVideoFrame();
  };
  const onPause = (): void => renderAtCurrentTime();
  const onSeek = (): void => {
    renderGeneration += 1;
    renderedFrameIndex = -1;
    renderAtCurrentTime();
  };
  const onTimeUpdate = (): void => renderAtCurrentTime();

  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onPause);
  video.addEventListener("seeked", onSeek);
  video.addEventListener("loadedmetadata", onTimeUpdate);
  video.addEventListener("timeupdate", onTimeUpdate);
  renderAtCurrentTime();

  return () => {
    disposed = true;
    renderGeneration += 1;
    video.removeEventListener("play", onPlay);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("seeked", onSeek);
    video.removeEventListener("loadedmetadata", onTimeUpdate);
    video.removeEventListener("timeupdate", onTimeUpdate);
    if (callbackHandle && "cancelVideoFrameCallback" in video) {
      video.cancelVideoFrameCallback(callbackHandle);
    }
    decodedCache.clear();
  };
}

function nearestFrame(frames: TapVideoDepthFrame[], time: number): TapVideoDepthFrame | null {
  if (frames.length === 0 || !Number.isFinite(time)) return null;
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle].presentationTimeSeconds < time) low = middle + 1;
    else high = middle - 1;
  }
  const after = frames[Math.min(low, frames.length - 1)];
  const before = frames[Math.max(0, low - 1)];
  return Math.abs(after.presentationTimeSeconds - time) < Math.abs(before.presentationTimeSeconds - time)
    ? after
    : before;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, "0")}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(4);
}
