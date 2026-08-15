import "./landing.css";
import {
  landingStageForProgress,
  storyProgressFromGeometry,
  type LandingStage
} from "./landing/progress";
import type { LandingScene } from "./landingScene";

const landing = document.querySelector<HTMLElement>("#landing");

if (!landing) {
  throw new Error("Missing #landing root.");
}

landing.innerHTML = `
  <a class="skip-link" href="#capture-story">跳到产品原理</a>

  <section class="landing-hero" aria-labelledby="landing-title">
    <div class="hero-lockup">
      <img class="hero-mark" src="./launch_logo.png" alt="" width="152" height="152" />
      <span class="hero-wordmark" aria-label="TAPCam">TAPCam</span>
    </div>
    <div class="hero-copy">
      <p class="hero-kicker">VERIFIABLE CAPTURE / SPATIAL MEDIA</p>
      <h1 id="landing-title">让媒体带着<br />拍摄凭证离开相机。</h1>
      <p>
        媒体一旦离开拍摄设备，来源、完整性与空间上下文往往无法一起核验。TAPCam 将媒体内容、
        深度数据和由 App Attest 支持的采集凭证绑定在同一次捕获中，让原始文件仍能被独立检查。
      </p>
    </div>
  </section>

  <section class="story" id="capture-story" data-story data-stage="capture" tabindex="-1" aria-label="TAPCam 工作原理">
    <div class="story-stage" aria-hidden="true">
      <canvas class="story-canvas" data-story-canvas></canvas>
      <div class="story-fallback" data-story-fallback hidden>
        <span>TAPCam</span>
        <small>RGB · DEPTH · APP ATTEST · CONTENT BINDING</small>
      </div>
      <div class="scene-labels scene-labels--capture">
        <span class="scene-label scene-label--output">PHOTO + DEPTH</span>
        <span class="scene-label scene-label--camera">RGB / DEPTH CAPTURE</span>
        <span class="scene-label scene-label--subject">SUBJECT</span>
      </div>
      <div class="scene-labels scene-labels--sign">
        <span>MEDIA</span><span>DEPTH</span><span>ATTESTATION</span><span>SIGNATURE</span>
      </div>
      <div class="scene-labels scene-labels--privacy">
        <span>LOCAL CHECK</span><span>PUBLIC VERIFIER</span><span>ZK / R&amp;D</span>
      </div>
      <div class="story-progress" aria-hidden="true">
        <span class="story-progress__line"><i data-progress-line></i></span>
        <span data-progress-label>01 / CAPTURE</span>
      </div>
    </div>

    <div class="story-chapters">
      <article class="story-chapter story-chapter--capture" data-chapter="capture">
        <div class="chapter-copy chapter-copy--left">
          <p class="chapter-number">01 / CAPTURE</p>
          <h2>画面在右，<br />照片与深度在左。</h2>
          <p>
            两个镜头构成 RGB 与深度捕获层的视觉意象：右侧是被摄对象，左侧同时形成照片和深度表达。
          </p>
          <p class="chapter-note">PHOTO → DEPTH → RELATIVE 3D</p>
        </div>
      </article>

      <article class="story-chapter story-chapter--sign" data-chapter="sign">
        <div class="chapter-copy chapter-copy--right">
          <p class="chapter-number">02 / BIND &amp; SIGN</p>
          <h2>数据包，<br />在离开相机前被绑定。</h2>
          <p>
            媒体、深度、清单与证明材料依次汇合；内容绑定与签名把这些资源固定在同一次捕获中。
          </p>
          <p class="chapter-note">MEDIA · DEPTH · MANIFEST · APP ATTEST</p>
        </div>
      </article>

      <article class="story-chapter story-chapter--privacy" data-chapter="privacy">
        <div class="chapter-copy chapter-copy--left">
          <p class="chapter-number">03 / OPEN VERIFICATION</p>
          <h2>验证属于每个人，<br />隐私仍属于你。</h2>
          <p>
            浏览器先执行本地内容绑定检查，再把证明材料交给明确的服务器验证边界。去中心化验证与零知识隐私证明是下一阶段研发方向。
          </p>
          <div class="research-tags" aria-label="当前能力与未来方向">
            <span>LOCAL CONTENT CHECKS</span>
            <span>PUBLIC VERIFIER</span>
            <span>PRIVATE PROOFS — ZK / R&amp;D</span>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section class="action-section" aria-labelledby="action-title">
    <div class="action-heading">
      <p>04 / NEXT</p>
      <h2 id="action-title">拍摄、验证，或者继续读下去。</h2>
    </div>
    <div class="action-grid">
      <a class="action-link action-link--download" href="https://testflight.apple.com/join/bwcgjzNd" target="_blank" rel="noopener noreferrer">
        <span class="action-index">01</span>
        <span class="action-type">DOWNLOAD</span>
        <strong>下载 TAPCam</strong>
        <span>通过 TestFlight 体验捕获流程</span>
      </a>
      <a class="action-link action-link--verify" href="./verify/">
        <span class="action-index">02</span>
        <span class="action-type">VERIFY</span>
        <strong>打开验证器</strong>
        <span>验证原始 TAPCam 照片与视频</span>
      </a>
      <a class="action-link action-link--docs" href="https://github.com/TAP-NAP/TAPCamVerifier/blob/main/Docs/VerificationFlow.md" target="_blank" rel="noopener noreferrer">
        <span class="action-index">03</span>
        <span class="action-type">TECHNOLOGY</span>
        <strong>阅读技术文档</strong>
        <span>了解协议、数据边界与验证流程</span>
      </a>
    </div>
    <footer class="landing-footer">
      <div class="footer-brand">
        <img src="./launch_logo.png" alt="" width="30" height="30" />
        <strong>TAPCam</strong>
      </div>
      <p>VERIFIABLE CAPTURE / RELATIVE SPATIAL MEDIA / PRIVATE PROOFS R&amp;D</p>
      <a href="https://github.com/TAP-NAP" target="_blank" rel="noopener noreferrer">GitHub</a>
    </footer>
  </section>
`;

const story = document.querySelector<HTMLElement>("[data-story]");
const canvas = document.querySelector<HTMLCanvasElement>("[data-story-canvas]");
const fallback = document.querySelector<HTMLElement>("[data-story-fallback]");
const progressLine = document.querySelector<HTMLElement>("[data-progress-line]");
const progressLabel = document.querySelector<HTMLElement>("[data-progress-label]");

if (!story || !canvas || !fallback || !progressLine || !progressLabel) {
  throw new Error("Landing story did not mount.");
}

let scene: LandingScene | null = null;
let sceneLoading: Promise<void> | null = null;
let storyIsVisible = false;
let updateFrame = 0;

const stageLabels: Record<LandingStage, string> = {
  capture: "01 / CAPTURE",
  sign: "02 / BIND & SIGN",
  privacy: "03 / OPEN VERIFICATION"
};

async function ensureScene(): Promise<void> {
  if (scene || sceneLoading) {
    return sceneLoading ?? Promise.resolve();
  }
  sceneLoading = import("./landingScene")
    .then(({ LandingScene: Scene }) => {
      scene = new Scene(canvas!);
      fallback!.hidden = true;
      updateStory();
      scene.setActive(storyIsVisible && !document.hidden);
    })
    .catch((error: unknown) => {
      console.warn("TAPCam landing scene could not start.", error);
      sceneLoading = null;
      fallback!.hidden = false;
      canvas!.hidden = true;
    });
  return sceneLoading;
}

function updateStory(): void {
  updateFrame = 0;
  const rect = story!.getBoundingClientRect();
  const progress = storyProgressFromGeometry(rect.top, rect.height, window.innerHeight);
  const stage = landingStageForProgress(progress);
  story!.dataset.stage = stage;
  progressLine!.style.transform = `scaleX(${progress.toFixed(4)})`;
  progressLabel!.textContent = stageLabels[stage];
  scene?.setProgress(progress);
}

function scheduleStoryUpdate(): void {
  if (!updateFrame) {
    updateFrame = window.requestAnimationFrame(updateStory);
  }
}

const scenePreloadObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      void ensureScene();
    }
  },
  { rootMargin: "55% 0px 55% 0px", threshold: 0 }
);

const sceneVisibilityObserver = new IntersectionObserver(
  (entries) => {
    storyIsVisible = entries.some((entry) => entry.isIntersecting);
    scene?.setActive(storyIsVisible && !document.hidden);
  },
  { threshold: 0.01 }
);

scenePreloadObserver.observe(story);
sceneVisibilityObserver.observe(story);
window.addEventListener("scroll", scheduleStoryUpdate, { passive: true });
window.addEventListener("resize", scheduleStoryUpdate, { passive: true });
document.addEventListener("visibilitychange", () => {
  scene?.setActive(storyIsVisible && !document.hidden);
});
canvas.addEventListener("tapcam:webgl-unavailable", () => {
  fallback.hidden = false;
});
canvas.addEventListener("tapcam:webgl-restored", () => {
  fallback.hidden = true;
  canvas.hidden = false;
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    scene?.setActive(false);
    return;
  }
  scenePreloadObserver.disconnect();
  sceneVisibilityObserver.disconnect();
  scene?.dispose();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    updateStory();
    scene?.setActive(storyIsVisible && !document.hidden);
  }
});

updateStory();
