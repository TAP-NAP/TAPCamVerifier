import { t } from "../i18n/i18n";
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
  let renderedFrame: TapVideoDepthFrame | null = null;
  let callbackHandle = 0;
  const decodedCache = new Map<TapVideoDepthFrame, Uint8Array>();

  let inspection: ReturnType<typeof inspectTapVideoDepth>;
  try {
    inspection = inspectTapVideoDepth(videoBytes);
  } catch (error) {
    console.warn("TAP video depth inspection failed", { errorType: error instanceof TypeError ? "TypeError" : "Error" });
    status.textContent = t("videoPlayer.depthUnavailable");
    status.classList.add("is-error");
    return () => {
      disposed = true;
    };
  }

  const format = inspection.manifest.payload.depthCoverage?.format;
  const displayTransform = inspection.manifest.payload.rgbTrack?.transform;
  const registration = inspection.manifest.payload.spatialRegistration;
  const frames = inspection.depthFrames;
  if (!format || frames.length === 0) {
    status.textContent = t("videoPlayer.noDepth");
    metadata.textContent = "";
    return () => {
      disposed = true;
    };
  }

  status.textContent = t("videoPlayer.depthWaiting");
  metadata.textContent = `${format.width} × ${format.height}`;

  const renderAtCurrentTime = (): void => {
    if (disposed) return;
    const frame = nearestFrame(frames, video.currentTime);
    if (!frame || frame === renderedFrame) return;
    const generation = ++renderGeneration;
    void decodedFrame(frame).then((decoded) => {
      if (disposed || generation !== renderGeneration) return;
      renderTapDepthFrame(decoded, format, canvas, displayTransform, registration);
      renderedFrame = frame;
      status.textContent = t("videoPlayer.depthAtTime", { time: formatTime(frame.presentationTimeSeconds) });
      status.classList.remove("is-error");
    }).catch((error) => {
      if (disposed || generation !== renderGeneration) return;
      console.warn("TAP video depth rendering failed", { errorType: error instanceof TypeError ? "TypeError" : "Error" });
      status.textContent = t("videoPlayer.depthUnavailable");
      status.classList.add("is-error");
    });
  };

  const decodedFrame = async (frame: TapVideoDepthFrame): Promise<Uint8Array> => {
    const cached = decodedCache.get(frame);
    if (cached) return cached;
    const decoded = await decodeTapDepthFrame(frame);
    decodedCache.set(frame, decoded);
    while (decodedCache.size > 2) {
      const oldest = decodedCache.keys().next().value as TapVideoDepthFrame | undefined;
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
    renderedFrame = null;
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
  // Preserve sample identity and file order; signed timestamps may repeat or regress.
  let nearest: TapVideoDepthFrame | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    const candidate = Math.abs(frame.presentationTimeSeconds - time);
    if (candidate < distance) {
      nearest = frame;
      distance = candidate;
    }
  }
  return nearest;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, "0")}`;
}
