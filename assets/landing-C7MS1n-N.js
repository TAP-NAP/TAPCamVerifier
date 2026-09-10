const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./landingScene-DHZJzG84.js","./preload-helper-KoZUx0NK.js","./preload-helper-DMY01L8v.css"])))=>i.map(i=>d[i]);
import{n as e,t}from"./languagePreference-FZnB_vY7.js";import{i as n,r,t as i}from"./preload-helper-KoZUx0NK.js";var a={capture:.1,sign:.5,privacy:.9},o={sign:.34,privacy:.68},s={capture:{enterStart:0,enterEnd:.1,exitStart:.24,exitEnd:.3},sign:{enterStart:.34,enterEnd:.44,exitStart:.6,exitEnd:.66},privacy:{enterStart:.7,enterEnd:.8}},c={captureExitEnd:.3,signEnterStart:.39,signEnterEnd:.43,signExitEnd:.66,privacyEnterStart:.75,privacyEnterEnd:.79},l={liftStart:.72,liftEnd:.9,contentStart:.9,contentEnd:1,travelViewportFraction:.22};function u(e){return Math.min(1,Math.max(0,e))}function d(e,t,n){return n<=t?+(e>=n):u((e-t)/(n-t))}function f(e){let t=u(e);return t*t*(3-2*t)}function p(e){return f(d(e,s.capture.enterStart,s.capture.enterEnd))*(1-f(d(e,s.capture.exitStart,s.capture.exitEnd)))}function m(e){return f(d(e,s.sign.enterStart,s.sign.enterEnd))*(1-f(d(e,s.sign.exitStart,s.sign.exitEnd)))}function h(e){return f(d(e,s.privacy.enterStart,s.privacy.enterEnd))}function g(e,t){let n=d(t,0,.72)*a.capture;return Math.max(u(e),n)}function ee(e,t,n,r=.45){return n<=t?+(e<n):1-f(d(e,t+(n-t)*u(r),n))}function te(e,t,n,r=.25){return n<=t?+(e>=t):f(d(e,t,t+(n-t)*u(r)))}function ne(e){return f(d(e,l.liftStart,l.liftEnd))}function re(e){return f(d(e,l.contentStart,l.contentEnd))}function ie(e){let t=u(e);return t<o.sign?`capture`:t<o.privacy?`sign`:`privacy`}function ae(e,t){return t<=1?0:u(e/(t-1))}function oe(e,t){let n=Math.abs(e)/Math.max(1,t);return Math.round(Math.min(1800,Math.max(620,520+n*520)))}function se(e,t,n,r,i){return e-Math.max(0,t)-Math.max(0,n)-Math.max(0,r)-Math.max(0,i)}function ce(e,t,n){let r=new Set(e),i=[...t];if(n<0){if(i.length===0)return[...r].sort((e,t)=>e-t);for(;i.length>0&&!r.has(i[i.length-1]);)i.pop();return i}for(let e of[...r].sort((e,t)=>e-t)){let t=i[i.length-1];!i.includes(e)&&(t===void 0||e>t)&&i.push(e)}return i}function le(e,t,n=0){return Math.max(0,e)-Math.max(0,t)-Math.max(0,n)}function ue(e,t){let n=[0,...t.map(u),1],r=[0,a.capture,a.sign,a.privacy,1],i=u(e);for(let e=1;e<n.length;e+=1)if(i<=n[e]){let t=d(i,n[e-1],n[e]),a=r[e-1];return a+(r[e]-a)*t}return 1}function _(e,t,n,r,i,a=0,o=2){if(n===0||t.length===0||i<=0)return null;if(n>0){for(let n=Math.max(0,r+1);n<t.length;n+=1){let r=t[n]-e;if(r>=-a&&r<=o)return t[n];if(r>o)return r<=i?t[n]:null}return null}for(let n=Math.min(r-1,t.length-1);n>=0;--n){let r=e-t[n];if(r>=-a&&r<=o)return t[n];if(r>o)return r<=i?t[n]:null}return null}function v(e,t,n){let r=Math.max(1,t-n);return u(-e/r)}function y(e,t){let n=Math.max(1,t);return u((n-e)/n)}var de={zh:{lead:`在 AI 时代，记录`,leadParts:[`在 AI 时代，`,`记录`],phrases:[`我们的生活`,`我们的影像`,`我们的回忆`,`我们的瞬间`,`有凭证的影像`,`有凭证的记录`,`可验证的照片`,`可验证的视频`,`被绑定的资源`,`可检查的字节`]},en:{lead:`In the age of AI, record`,leadParts:[`In the age of AI,`,`record`],phrases:[`our life`,`our images`,`our memories`,`our moments`,`credentialed images`,`credentialed records`,`verifiable photos`,`verifiable videos`,`bound resources`,`inspectable bytes`]}},fe={zh:{skip:`跳到产品原理`,"nav.verifier":`验证器`,"nav.docs":`文档`,"nav.download":`下载`,"hero.title":`在 AI 时代，记录<br />我们的生活`,"hero.body":`AI 时代下，摄影仍然承载感受与表达。<br />TAPCam 将相机采集的媒体与设备凭证绑定，让接收者可以检查签名以及明确资源字节与签名绑定是否一致。<br />验证结果不证明真实场景、作者身份或非 AI 来源。`,"capture.title":`捕捉色彩，<br />记录纵深。`,"capture.body":`TAPCam 同时记录影像与设备提供的深度数据，并把明确的资源集合纳入内容绑定。深度用于可视化，不证明物理场景或深度本身正确。`,"callout.rgb":`RGB 图像`,"callout.depth":`深度数据`,"callout.camera":`空间相机`,"callout.subject":`被摄对象`,"sign.title":`凭证绑定，<br />可被独立检查。`,"sign.body":`TAPCam 使用 Apple App Attest 生成签名凭证，把媒体、深度可用性与明确资源集合纳入同一内容绑定；验证器检查收到的字节是否与该绑定一致。`,"privacy.title":`验证边界，<br />应当清晰可查。`,"privacy.body":`原始媒体留在浏览器本地，服务器只接收签名验证材料。公开的实现与协议让验证范围可以被检查；尚未实现的隐私能力不会作为当前保证。`,"privacy.tagsLabel":`验证原则与当前边界`,"action.title":`从现在开始，记录当下。`,"action.download.title":`下载 TAPCam`,"action.download.body":`现在参与 TestFlight 进行测试`,"action.verify.title":`打开验证器`,"action.verify.body":`检查 TAPCam 媒体的签名凭证与内容绑定`,"action.docs.title":`阅读技术文档`,"action.docs.body":`了解协议、数据边界与验证流程`},en:{skip:`Skip to how TAPCam works`,"nav.verifier":`VERIFIER`,"nav.docs":`DOCS`,"nav.download":`DOWNLOAD`,"hero.title":`In the age of AI, record<br />our life`,"hero.body":`Photography still carries feeling and expression in the age of AI.<br />TAPCam binds camera-captured media to a device credential so recipients can check the signature and whether the declared resource bytes match the signed binding.<br />Verification does not prove a real scene, authorship, or non-AI origin.`,"capture.title":`Capture color. <br />Record depth.`,"capture.body":`TAPCam records images alongside device-provided depth data and includes the declared resource set in its content binding. Depth supports visualization; it does not prove the physical scene or depth correctness.`,"callout.rgb":`RGB IMAGE`,"callout.depth":`DEPTH DATA`,"callout.camera":`SPATIAL CAMERA`,"callout.subject":`SUBJECT`,"sign.title":`Credential binding, <br />independently inspectable.`,"sign.body":`TAPCam uses Apple App Attest to create a signing credential that covers media, depth availability, and the declared resource set in one content binding; the verifier checks received bytes against that binding.`,"privacy.title":`Verification boundaries <br />should be inspectable.`,"privacy.body":`Original media stays in the browser; the server receives only signature-verification material. Published implementation and protocols make the scope inspectable, while unimplemented privacy features are not presented as current guarantees.`,"privacy.tagsLabel":`Verification principles and current boundaries`,"action.title":`Start now. Capture the moment.`,"action.download.title":`Download TAPCam`,"action.download.body":`Join the TestFlight beta now`,"action.verify.title":`Open the verifier`,"action.verify.body":`Check TAPCam media credentials and content binding`,"action.docs.title":`Read the technology docs`,"action.docs.body":`Understand the protocol, data boundaries, and verification flow`}};function pe(){return t()}function me(t){e(t)}function b(e,t){return fe[e][t]}function he(e){return de[e]}var ge=Array.from(`#7%/□01+×△◇`),_e=.38,ve=4400;function ye(e,t){return e<=0||t<=0?1:Math.min(1,e/t)}function be(e,t,n=1){if(e<=0||t<=0)return 1;let r=Math.floor(e/t);return Math.max(1,r-Math.max(0,Math.floor(n)))}function xe(e){return Math.min(1,Math.max(0,e))}function Se(e){let t=xe(e);return t*t*(3-2*t)}function Ce(e){return ge[Math.min(ge.length-1,Math.floor(e()*ge.length))]}function we(e,t,n,r=Math.random){let i=xe(n),a=Array.from(e),o=Array.from(t);if(i===0)return a.map(e=>({character:e,state:`resolved`}));if(i===1)return o.map(e=>({character:e,state:`resolved`}));let s=Math.max(a.length,o.length),c=[];if(i<_e){let e=Se(i/_e);for(let t=0;t<s;t+=1){let n=a[t],i=!n||r()<e;c.push(i?{character:Ce(r),state:`scrambled`}:{character:n,state:`resolved`})}return c}let l=Se((i-_e)/(1-_e)),u=Math.floor(l*o.length);for(let e=0;e<s;e+=1){let t=o[e];t&&e<u?c.push({character:t,state:`resolved`}):c.push({character:Ce(r),state:`scrambled`})}return c}var x=document.querySelector(`#landing`);if(!x)throw Error(`Missing #landing root.`);var S=pe();x.innerHTML=`
  <a class="skip-link" href="#capture-story" data-copy="skip">跳到产品原理</a>

  ${r({assetBase:`./`,homeHref:`#intro`,verifyHref:`./verify/`,locale:S,navAriaLabel:S===`zh`?`TAPCam 主导航`:`TAPCam navigation`,copyKeys:{verify:`nav.verifier`,docs:`nav.docs`,download:`nav.download`}})}

  <nav class="landing-progress" aria-label="页面章节" data-page-progress>
    <span class="landing-progress__rail" aria-hidden="true"><i data-page-progress-line></i></span>
    <div class="landing-progress__steps">
      <a href="#intro" data-progress-step="intro" aria-label="00 INTRO" aria-current="step">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>00</b><small><span class="progress-label--full">INTRO</span><span class="progress-label--compact" aria-hidden="true">INTRO</span></small></span>
      </a>
      <a href="#capture" data-progress-step="capture" aria-label="01 CAPTURE">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>01</b><small><span class="progress-label--full">CAPTURE</span><span class="progress-label--compact" aria-hidden="true">CAPTURE</span></small></span>
      </a>
      <a href="#bind-sign" data-progress-step="sign" aria-label="02 BIND &amp; SIGN">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>02</b><small><span class="progress-label--full">BIND &amp; SIGN</span><span class="progress-label--compact" aria-hidden="true">SIGN</span></small></span>
      </a>
      <a href="#open-verification" data-progress-step="privacy" aria-label="03 OPEN VERIFICATION">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>03</b><small><span class="progress-label--full">OPEN VERIFICATION</span><span class="progress-label--compact" aria-hidden="true">VERIFY</span></small></span>
      </a>
      <a href="#next" data-progress-step="next" aria-label="04 NEXT">
        <span class="landing-progress__dot" aria-hidden="true"></span>
        <span><b>04</b><small><span class="progress-label--full">NEXT</span><span class="progress-label--compact" aria-hidden="true">NEXT</span></small></span>
      </a>
    </div>
  </nav>
  <p class="visually-hidden" role="status" aria-live="polite" data-page-status></p>

  <section class="landing-hero" id="intro" aria-labelledby="landing-title">
    <div class="hero-particles" data-hero-particles aria-hidden="true"></div>
    <div class="hero-lockup">
      <span class="hero-wordmark" aria-label="TAPCam">TAPCam</span>
    </div>
    <div class="hero-copy">
      <p class="hero-kicker">VERIFIABLE CAPTURE / SPATIAL MEDIA</p>
      <h1 id="landing-title">
        <span class="hero-title__accessible visually-hidden" data-hero-accessible>
          在 AI 时代，记录我们的生活
        </span>
        <span class="hero-title__visual" aria-hidden="true">
          <span class="hero-title__lead" data-hero-lead>
            <span class="hero-title__lead-part" data-hero-lead-primary>在 AI 时代，</span>
            <span class="hero-title__lead-part" data-hero-lead-secondary>记录</span>
          </span>
          <span class="hero-title__decode">
            <span class="hero-title__value" data-hero-value>我们的生活</span>
          </span>
        </span>
      </h1>
      <p class="hero-body" data-copy-html="hero.body">
        AI 时代下，摄影仍然承载感受与表达。<br />
        TAPCam 将相机采集的媒体与设备凭证绑定，让接收者可以检查签名以及明确资源字节与签名绑定是否一致。<br />
        验证结果不证明真实场景、作者身份或非 AI 来源。
      </p>
      <div class="scroll-cue" aria-hidden="true">
        <svg viewBox="0 0 96 24" focusable="false">
          <path d="M2 2 48 22 94 2" />
        </svg>
      </div>
    </div>
  </section>

  <section class="story" id="capture-story" data-story data-stage="capture" tabindex="-1" aria-label="TAPCam 工作原理">
    <div class="story-stage" aria-hidden="true">
      <canvas class="story-canvas" data-story-canvas></canvas>
      <div class="story-fallback" data-story-fallback hidden>
        <span>TAPCam</span>
        <small>RGB · DEPTH · APP ATTEST · CONTENT BINDING</small>
      </div>
      <div class="scene-callouts scene-callouts--capture">
        <span class="scene-callout scene-callout--rgb" data-scene-callout="rgb">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.rgb">RGB 图像</span>
        </span>
        <span class="scene-callout scene-callout--depth" data-scene-callout="depth">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.depth">深度数据</span>
        </span>
        <span class="scene-callout scene-callout--camera" data-scene-callout="camera">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.camera">空间相机</span>
        </span>
        <span class="scene-callout scene-callout--subject" data-scene-callout="subject">
          <i class="scene-callout__leader scene-callout__leader--one"></i>
          <i class="scene-callout__leader scene-callout__leader--two"></i>
          <span class="scene-callout__text" data-copy="callout.subject">被摄对象</span>
        </span>
      </div>
      <div class="scene-labels scene-labels--sign">
        <span>MEDIA</span><span>DEPTH</span><span>ATTESTATION</span><span>SIGNATURE</span>
      </div>
      <div class="scene-labels scene-labels--privacy">
        <span>LOCAL FIRST</span><span>OPEN SOURCE</span><span>BOUND-BYTE CHECKS</span>
      </div>
    </div>

    <div class="story-chapters">
      <article class="story-chapter story-chapter--capture" id="capture" data-chapter="capture">
        <div class="chapter-copy chapter-copy--left">
          <p class="chapter-number">01 / CAPTURE</p>
          <h2 data-copy-html="capture.title">捕捉色彩，<br />记录纵深。</h2>
          <p data-copy="capture.body">
            TAPCam 同时记录影像与设备提供的深度数据，并把明确的资源集合纳入内容绑定。深度用于可视化，不证明物理场景或深度本身正确。
          </p>
          <p class="chapter-note">DEPTH PHOTO &lt;- SPATIAL CAM &lt;- CAMERA INPUT</p>
        </div>
      </article>

      <article class="story-chapter story-chapter--sign" id="bind-sign" data-chapter="sign">
        <div class="chapter-copy chapter-copy--right">
          <p class="chapter-number">02 / BIND &amp; SIGN</p>
          <h2 data-copy-html="sign.title">凭证绑定，<br />可被独立检查。</h2>
          <p data-copy="sign.body">
            TAPCam 使用 Apple App Attest 生成签名凭证，把媒体、深度可用性与明确资源集合纳入同一内容绑定；验证器检查收到的字节是否与该绑定一致。
          </p>
          <p class="chapter-note">MEDIA · DEPTH · ATTESTATION · SIGNATURE</p>
        </div>
      </article>

      <article class="story-chapter story-chapter--privacy" id="open-verification" data-chapter="privacy">
        <div class="chapter-copy chapter-copy--left">
          <p class="chapter-number">03 / OPEN VERIFICATION</p>
          <h2 data-copy-html="privacy.title">验证边界，<br />应当清晰可查。</h2>
          <p data-copy="privacy.body">
            原始媒体留在浏览器本地，服务器只接收签名验证材料。公开的实现与协议让验证范围可以被检查；尚未实现的隐私能力不会作为当前保证。
          </p>
          <div class="research-tags" data-copy-aria-label="privacy.tagsLabel" aria-label="验证原则与当前边界">
            <span>LOCAL FIRST</span>
            <span>OPEN SOURCE</span>
            <span>BOUND-BYTE CHECKS</span>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section class="action-section" id="next" aria-labelledby="action-title">
    <div class="action-heading">
      <p>04 / NEXT</p>
      <h2 id="action-title" data-copy="action.title">从现在开始，记录当下。</h2>
    </div>
    <div class="action-grid">
      <a class="action-link action-link--download" href="https://testflight.apple.com/join/bwcgjzNd" target="_blank" rel="noopener noreferrer">
        <span class="action-index">01</span>
        <span class="action-type">DOWNLOAD</span>
        <strong data-copy="action.download.title">下载 TAPCam</strong>
        <span data-copy="action.download.body">现在参与 TestFlight 进行测试</span>
      </a>
      <a class="action-link action-link--verify" href="./verify/">
        <span class="action-index">02</span>
        <span class="action-type">VERIFY</span>
        <strong data-copy="action.verify.title">打开验证器</strong>
        <span data-copy="action.verify.body">检查 TAPCam 媒体的签名凭证与内容绑定</span>
      </a>
      <a class="action-link action-link--docs" href="https://github.com/TAP-NAP/TAPCamVerifier#verification-flow" target="_blank" rel="noopener noreferrer">
        <span class="action-index">03</span>
        <span class="action-type">TECHNOLOGY</span>
        <strong data-copy="action.docs.title">阅读技术文档</strong>
        <span data-copy="action.docs.body">了解协议、数据边界与验证流程</span>
      </a>
    </div>
    <footer class="landing-footer">
      <p>Built by Harold with love</p>
    </footer>
  </section>
`;var C=document.querySelector(`[data-story]`),Te=document.querySelector(`.story-stage`),w=document.querySelector(`[data-story-canvas]`),T=document.querySelector(`[data-story-fallback]`),Ee=document.querySelector(`#next`),De=Array.from(document.querySelectorAll(`.action-link`)),Oe=document.querySelector(`[data-page-progress]`),ke=document.querySelector(`[data-page-progress-line]`),E=Array.from(document.querySelectorAll(`[data-progress-step]`)),Ae=document.querySelector(`[data-page-status]`),je=Array.from(document.querySelectorAll(`[data-chapter] .chapter-copy`)),Me=[`rgb`,`camera`,`subject`,`depth`],Ne=new Map;for(let e of document.querySelectorAll(`[data-scene-callout]`)){let t=e.dataset.sceneCallout;t&&Ne.set(t,e)}var D=new Map,O=new Map,k=document.querySelector(`[data-language-toggle]`),Pe=document.querySelector(`[data-top-navigation]`),Fe=document.querySelector(`[data-hero-lead]`),Ie=document.querySelector(`[data-hero-lead-primary]`),Le=document.querySelector(`[data-hero-lead-secondary]`),A=document.querySelector(`[data-hero-value]`),Re=document.querySelector(`[data-hero-accessible]`),ze=document.querySelector(`[data-hero-particles]`);if(!C||!Te||!w||!T||!Ee||De.length!==3||!Oe||!ke||E.length!==5||!Ae||je.length!==3||!k||!Pe||!Fe||!Ie||!Le||!A||!Re||!ze)throw Error(`Landing story did not mount.`);var Be={intro:0,capture:1,sign:2,privacy:3,next:4},Ve=[`intro`,`capture`,`sign`,`privacy`,`next`],He={zh:{intro:`介绍`,capture:`捕获`,sign:`绑定与签名`,privacy:`开放验证`,next:`下一步`},en:{intro:`Introduction`,capture:`Capture`,sign:`Bind and sign`,privacy:`Open verification`,next:`Next`}},j=`intro`,Ue,We=1,Ge=1;function Ke(e){let t=document.createDocumentFragment(),n=e.some(e=>e.state===`scrambled`)?e.slice(0,Ge):e;for(let e of n){let n=document.createElement(`span`);n.className=`hero-title__glyph`,n.dataset.state=e.state,n.textContent=e.character,t.append(n)}A.replaceChildren(t),A.style.setProperty(`--hero-phrase-scale`,We.toFixed(4))}function qe(e){A.textContent=e,A.dataset.scrambling=`false`,A.style.setProperty(`--hero-phrase-scale`,We.toFixed(4))}function Je(){let e=A.closest(`.hero-title__decode`);if(!e)return;let t=A.cloneNode(!1);t.removeAttribute(`data-hero-value`),t.dataset.scrambling=`false`,t.setAttribute(`aria-hidden`,`true`),t.style.position=`absolute`,t.style.visibility=`hidden`,t.style.minWidth=`0`,t.style.width=`max-content`,t.style.transform=`none`,e.append(t);let n=0;for(let e of he(S).phrases)t.textContent=e,n=Math.max(n,t.scrollWidth);t.remove(),We=ye(Math.max(0,e.clientWidth-2),n),A.style.setProperty(`--hero-phrase-scale`,We.toFixed(4));let r=A.cloneNode(!1);r.removeAttribute(`data-hero-value`),r.dataset.scrambling=`true`,r.setAttribute(`aria-hidden`,`true`),r.style.position=`absolute`,r.style.visibility=`hidden`,r.style.width=`max-content`,r.style.minWidth=`0`,r.style.transform=`none`;for(let e of ge){let t=document.createElement(`span`);t.className=`hero-title__glyph`,t.dataset.state=`scrambled`,t.textContent=e,r.append(t)}e.append(r);let i=Math.max(1,...Array.from(r.children,e=>e.getBoundingClientRect().width));r.remove(),Ge=be(Math.max(0,e.clientWidth-2),i,1)}function Ye(e,t){Re.textContent=S===`zh`?`${e}${t}`:`${e} ${t}`}function Xe(e){S=e,x.dataset.locale=e,document.documentElement.lang=e===`zh`?`zh-CN`:`en`,document.title=`TAPCam`,document.querySelectorAll(`[data-copy]`).forEach(t=>{t.textContent=b(e,t.dataset.copy)}),document.querySelectorAll(`[data-copy-html]`).forEach(t=>{t.innerHTML=b(e,t.dataset.copyHtml)}),document.querySelectorAll(`[data-copy-aria-label]`).forEach(t=>{t.setAttribute(`aria-label`,b(e,t.dataset.copyAriaLabel))});let t=he(e);Ie.textContent=t.leadParts[0],Le.textContent=t.leadParts[1],qe(t.phrases[0]),Je(),Ye(t.lead,t.phrases[0]),Ue?.(),D.clear(),O.clear(),document.querySelector(`meta[name="description"]`)?.setAttribute(`content`,e===`zh`?`TAPCam 将媒体、深度数据与采集凭证绑定在同一次捕获中，让原始文件离开相机后仍能被独立检查。`:`TAPCam binds media, depth data, and capture evidence in one capture so original files remain independently inspectable after leaving the camera.`),k.dataset.locale=e,k.setAttribute(`aria-label`,e===`zh`?`Switch to English`:`切换到中文`),Pe.setAttribute(`aria-label`,e===`zh`?`TAPCam 主导航`:`TAPCam navigation`),Oe.setAttribute(`aria-label`,e===`zh`?`页面章节`:`Page chapters`),C.setAttribute(`aria-label`,e===`zh`?`TAPCam 工作原理`:`How TAPCam works`),Ae.textContent=He[e][j]}k.addEventListener(`click`,()=>{let e=Y().findIndex(e=>Math.abs(e-window.scrollY)<=4),t=S===`zh`?`en`:`zh`;me(t),Xe(t),window.requestAnimationFrame(()=>{e>=0?(H=e,Z(Y()[e],K.matches?1:220)):$()})}),Xe(S);var Ze={rgb:[`aboveLeft`,`above`,`left`,`farAbove`,`belowLeft`,`right`,`farBelow`],camera:[`above`,`aboveLeft`,`aboveRight`,`farAbove`,`left`,`right`,`below`],subject:[`aboveRight`,`above`,`right`,`farAbove`,`aboveLeft`,`belowRight`,`left`],depth:[`belowLeft`,`below`,`left`,`farBelow`,`aboveLeft`,`right`,`farAbove`]};function M(e,t,n){return Math.min(n,Math.max(t,e))}function N(e,t,n){return{left:e.x-t,top:e.y-n,right:e.x+t,bottom:e.y+n}}function Qe(e,t){return{left:e.left-t,top:e.top-t,right:e.right+t,bottom:e.bottom+t}}function $e(e,t){return Math.max(0,Math.min(e.right,t.right)-Math.max(e.left,t.left))*Math.max(0,Math.min(e.bottom,t.bottom)-Math.max(e.top,t.top))}function et(e){let t=D.get(e);if(t)return t;let n=(Ne.get(e)?.querySelector(`.scene-callout__text`))?.getBoundingClientRect(),r={width:Math.max(1,Math.ceil(n?.width??1)),height:Math.max(1,Math.ceil(n?.height??1))};return D.set(e,r),r}function tt(e,t,n,r){let i=(t.left+t.right)*.5,a=(t.top+t.bottom)*.5,o=i-n.width*.5,s=t.top-r-n.height;switch(e){case`aboveLeft`:o=t.left;break;case`aboveRight`:o=t.right-n.width;break;case`below`:s=t.bottom+r;break;case`belowLeft`:o=t.left,s=t.bottom+r;break;case`belowRight`:o=t.right-n.width,s=t.bottom+r;break;case`left`:o=t.left-r-n.width,s=a-n.height*.5;break;case`right`:o=t.right+r,s=a-n.height*.5;break;case`farAbove`:s=t.top-r*3.25-n.height;break;case`farBelow`:s=t.bottom+r*3.25;break;case`above`:break}return{left:o,top:s,right:o+n.width,bottom:s+n.height}}function nt(e,t){let n=e.right-e.left,r=e.bottom-e.top,i=M(e.left,t.left,Math.max(t.left,t.right-n)),a=M(e.top,t.top,Math.max(t.top,t.bottom-r));return{left:i,top:a,right:i+n,bottom:a+r}}function rt(e,t,n,r){let i=M(n.x,r.left,r.right),a=M(n.y,r.top,r.bottom);if(i===n.x&&a===n.y&&n.x>=r.left&&n.x<=r.right&&n.y>=r.top&&n.y<=r.bottom){let e=[{distance:n.x-r.left,x:r.left,y:n.y},{distance:r.right-n.x,x:r.right,y:n.y},{distance:n.y-r.top,x:n.x,y:r.top},{distance:r.bottom-n.y,x:n.x,y:r.bottom}].sort((e,t)=>e.distance-t.distance);i=e[0].x,a=e[0].y}let o=i-n.x,s=a-n.y,c=Math.max(1,Math.hypot(o,s)),l=-s/c,u=o/c,d=e===`camera`||e===`depth`?-1:1,f=Math.min(11,c*.12)*d,p=o*.64+l*f,m=s*.64+u*f,h=o-p,g=s-m;t.style.setProperty(`--label-x`,`${(r.left-n.x).toFixed(2)}px`),t.style.setProperty(`--label-y`,`${(r.top-n.y).toFixed(2)}px`),t.style.setProperty(`--label-transform`,`none`),t.style.setProperty(`--elbow-x`,`${p.toFixed(2)}px`),t.style.setProperty(`--elbow-y`,`${m.toFixed(2)}px`),t.style.setProperty(`--leader-one`,`${Math.hypot(p,m).toFixed(2)}px`),t.style.setProperty(`--leader-angle-one`,`${(Math.atan2(m,p)*180/Math.PI).toFixed(2)}deg`),t.style.setProperty(`--leader-two`,`${Math.hypot(h,g).toFixed(2)}px`),t.style.setProperty(`--leader-angle-two`,`${(Math.atan2(g,h)*180/Math.PI).toFixed(2)}deg`)}function it(e,t,n={}){let r=Math.max(1,w.clientWidth),i=Math.max(1,w.clientHeight),a={};for(let t of Me){let n=e[t];if(!n)return;a[t]={x:n.x*r/100,y:n.y*i/100}}let o=e=>({left:e.left*r/100,top:e.top*i/100,right:e.right*r/100,bottom:e.bottom*i/100}),s={rgb:n.rgb?o(n.rgb):N(a.rgb,M(r*.09,54,160),M(i*.06,42,100)),depth:n.depth?o(n.depth):N(a.depth,M(r*.09,54,160),M(i*.06,42,100)),camera:N(a.camera,M(r*.06,35,105),M(i*.1,52,145)),subject:N(a.subject,M(r*.17,68,260),M(i*.18,76,280))},c={left:s.depth.left,top:s.depth.top-M(i*.015,8,22),right:a.depth.x+M(r*.34,140,420),bottom:s.depth.bottom+M(i*.015,8,22)},l=[s.rgb,s.camera,s.subject,c].map(e=>Qe(e,7)),u=M(r*.035,16,48),d={left:u,top:M(i*.11,92,132),right:r-u,bottom:i*.61},f=M(Math.min(r,i)*.025,12,28),p=[];for(let e of Me){let n=Ne.get(e);if(!n)continue;let o=et(e),c=Ze[e].map((t,n)=>{let r=tt(t,s[e],o,f),i=nt(r,d),c=Qe(i,5),u=Math.hypot(i.left-r.left,i.top-r.top),m=l.reduce((e,t)=>e+$e(c,t),0),h=p.reduce((e,t)=>e+$e(c,t),0),g=(i.left+i.right)*.5,ee=(i.top+i.bottom)*.5,te=Math.hypot(g-a[e].x,ee-a[e].y);return{direction:t,rect:i,score:m*28+h*44+u*3+n*260+te*.12}});c.sort((e,t)=>e.score-t.score);let u=c[0],m=O.get(e),h=c.find(e=>e.direction===m);h&&h.score<=u.score+220&&(u=h),O.set(e,u.direction),p.push(Qe(u.rect,9)),n.style.left=`${(a[e].x/r*100).toFixed(3)}%`,n.style.top=`${(a[e].y/i*100).toFixed(3)}%`,n.style.opacity=t.toFixed(3),rt(e,n,a[e],u.rect)}}var P=null,F=null,I=!1,at=0,L=0,R=0,z=0,B=!1,V=null,H=null,U=null,W=window.scrollY,G=0,ot=0,st=[],ct=window.scrollY,lt=0,K=window.matchMedia(`(prefers-reduced-motion: reduce)`),ut=0,dt=0,ft=0,pt=0;function mt(){window.clearTimeout(dt),window.cancelAnimationFrame(ft),dt=0,ft=0,pt+=1}function q(){mt();let e=he(S),t=e.phrases[ut]??e.phrases[0];if(qe(t),Ye(e.lead,t),K.matches||document.hidden||e.phrases.length<2)return;let n=pt;dt=window.setTimeout(()=>{let r=(ut+7)%e.phrases.length,i=e.phrases[r],a=performance.now(),o=s=>{if(n!==pt)return;let c=Math.min(1,(s-a)/760);if(A.dataset.scrambling=c<1?`true`:`false`,Ke(we(t,i,c)),c<1){ft=window.requestAnimationFrame(o);return}ut=r,Ye(e.lead,i),q()};ft=window.requestAnimationFrame(o)},ve)}Ue=()=>{ut=0,q()},q(),K.addEventListener(`change`,q);var ht=n(ze,{revealCats:!0,canvasClassName:`hero-particle-canvas`}),gt=new IntersectionObserver(([e])=>ht.setActive(!!e?.isIntersecting),{threshold:.02});gt.observe(ze);var _t=12,vt=.52,yt=window.innerWidth,bt=J(),xt=new Set([`ArrowDown`,`ArrowUp`,`PageDown`,`PageUp`,`Home`,`End`,` `]);function J(){return Math.max(1,Te.clientHeight)}function St(){return J()*vt}function Ct(){return Math.max(0,Oe.getBoundingClientRect().top)}function wt(e,t){let n=Ct(),r=je.map(r=>{let i=r.closest(`.story-chapter`);if(!i)return 0;let a=i.getBoundingClientRect(),o=window.getComputedStyle(i),s=window.getComputedStyle(r);return u((se(window.scrollY+a.bottom,Number.parseFloat(o.paddingBottom)||0,St(),Number.parseFloat(s.marginBottom)||0,r.offsetHeight)-le(n,r.offsetHeight,_t)-e)/t)});return[r[0],r[1],r[2]]}function Tt(e,t){let n=window.matchMedia(`(max-width: 780px)`).matches,r=Ct(),i=[c.captureExitEnd,c.signExitEnd,1],o=[a.capture,a.sign,a.privacy],s=[null,[c.signEnterStart,c.signEnterEnd],[c.privacyEnterStart,c.privacyEnterEnd]];je.forEach((c,u)=>{let d=le(r,c.offsetHeight,_t),f=Math.max(1,window.devicePixelRatio||1),p=n?Math.round(d*f)/f:d,m=c.closest(`.story-chapter`),h=m?.getBoundingClientRect(),g=m?window.getComputedStyle(m):null,ie=window.getComputedStyle(c),ae=h&&g?se(window.scrollY+h.bottom,Number.parseFloat(g.paddingBottom)||0,St(),Number.parseFloat(ie.marginBottom)||0,c.offsetHeight):window.scrollY+c.getBoundingClientRect().top,oe=i[u]??1,ce=ee(e,o[u]??a.privacy,oe),ue=s[u],_=ce*(u===0?1:ue?te(e,ue[0],ue[1],1):1),v=u===0&&n,y=v?ne(t):1,de=v?re(t):1,fe=v?(1-y)*J()*l.travelViewportFraction:0,pe=!v||y>.001,me=`${p}px`;c.style.getPropertyValue(`--chapter-copy-fixed-top`)!==me&&c.style.setProperty(`--chapter-copy-fixed-top`,me);let b=pe&&_>.02&&(v||ae-window.scrollY<=p+.5);if(b&&c.dataset.panelPosition!==`fixed`){let e=c.getBoundingClientRect();c.style.setProperty(`--chapter-copy-fixed-left`,`${e.left}px`),c.style.setProperty(`--chapter-copy-fixed-width`,`${e.width}px`),c.dataset.panelPosition=`fixed`}else !b&&c.dataset.panelPosition===`fixed`&&(delete c.dataset.panelPosition,c.style.removeProperty(`--chapter-copy-fixed-left`),c.style.removeProperty(`--chapter-copy-fixed-width`));c.style.setProperty(`--chapter-copy-entry-offset`,`${fe.toFixed(2)}px`),c.style.setProperty(`--chapter-copy-content-opacity`,de.toFixed(4)),c.style.setProperty(`--chapter-copy-opacity`,_.toFixed(4)),c.dataset.panelState=!pe||_<=.02?`hidden`:_<.98||de<.98||y<.98?`fading`:`visible`})}function Y(){let e=C.getBoundingClientRect(),t=Ee.getBoundingClientRect(),n=J(),r=window.scrollY+e.top,i=Math.max(1,e.height-n),a=Math.max(0,document.documentElement.scrollHeight-n);return[0,...wt(r,i).map(e=>r+i*e),window.scrollY+t.top].map(e=>Math.min(a,Math.max(0,e)))}function Et(){V!==null&&(document.documentElement.style.scrollBehavior=V,V=null)}function Dt(){V===null&&(V=document.documentElement.style.scrollBehavior,document.documentElement.style.scrollBehavior=`auto`)}function Ot(){z&&=(window.cancelAnimationFrame(z),0),B=!1,Et()}function X(e=!0){Ot(),window.clearTimeout(L),window.clearTimeout(R),L=0,R=0,e&&(H=null,U=null),G=0,W=window.scrollY}function Z(e,t){Ot();let n=window.scrollY,r=e-n;if(Dt(),Math.abs(r)<=2||K.matches){window.scrollTo(0,e),Et(),G=0,W=window.scrollY,U=null,$();return}let i=performance.now();B=!0;let a=e=>{if(!B)return;let o=u((e-i)/t),s=1-(1-o)**3;if(window.scrollTo(0,n+r*s),o<1){z=window.requestAnimationFrame(a);return}z=0,B=!1,Et(),G=0,W=window.scrollY,U=null,$()};z=window.requestAnimationFrame(a)}function kt(){if(L=0,B||K.matches||G===0)return;let e=J(),t=e*(G>0?.26:.38),n=Y(),r=_(window.scrollY,n,G,ot,t,e*.08);if(r===null){ot=Be[j];return}let i=n.findIndex(e=>Math.abs(e-r)<=2);H=i>=0?i:null,Z(r,G>0?380:520)}function At(){let e=window.scrollY,t=e-W;if(!B&&Math.abs(t)>1){let e=t>0?1:-1;e!==G&&(G=e,ot=Be[j]),window.clearTimeout(L),L=window.setTimeout(kt,120)}W=e,$()}E.forEach((e,t)=>{e.addEventListener(`click`,n=>{n.preventDefault(),X(),H=t,U=t,$();let r=Y()[t];Z(r,oe(r-window.scrollY,J())),window.history.replaceState(null,``,e.hash)})});async function jt(){return P||F?F??Promise.resolve():(F=i(async()=>{let{LandingScene:e}=await import(`./landingScene-DHZJzG84.js`);return{LandingScene:e}},__vite__mapDeps([0,1,2]),import.meta.url).then(({LandingScene:e})=>{P=new e(w),T.hidden=!0,Q(),P.setActive(I&&!document.hidden)}).catch(e=>{console.warn(`TAPCam landing scene could not start.`,e),F=null,T.hidden=!1,w.hidden=!0}),F)}function Q(){at=0;let e=C.getBoundingClientRect(),t=J();C.style.setProperty(`--chapter-transition-runway`,`${St()}px`);let n=ue(v(e.top,e.height,t),wt(window.scrollY+e.top,Math.max(1,e.height-t))),r=y(e.top,t),i=(1-r)*t*-.4;C.style.setProperty(`--scene-entry-offset`,`${i}px`),C.dataset.stagePinned=e.top<=0?`true`:`false`;let a=ie(n);C.dataset.stage=a,C.style.setProperty(`--sign-label-opacity`,m(n).toFixed(4)),C.style.setProperty(`--privacy-label-opacity`,h(n).toFixed(4)),Tt(n,r),Nt(e,n,a),Mt(),P?.setProgress(g(n,r))}function Mt(){if(!window.matchMedia(`(max-width: 780px)`).matches){st=[];for(let e of De)delete e.dataset.mobileActive;return}let e=window.scrollY,t=e-ct;Math.abs(t)>1&&(lt=t>0?1:-1),ct=e;let n=Pe.closest(`.landing-topbar`)?.getBoundingClientRect().bottom??0,r=Oe.getBoundingClientRect().top,i=n+8,a=r-8;st=ce(De.flatMap((e,t)=>{let n=e.getBoundingClientRect();return n.top>=i-1&&n.bottom<=a+1?[t]:[]}),st,lt);let o=st.at(-1)??null;De.forEach((e,t)=>{t===o?e.dataset.mobileActive=`true`:delete e.dataset.mobileActive})}function Nt(e,t,n){let r=J(),i=Math.max(1,window.scrollY+e.top),a=Ee.getBoundingClientRect(),o=`intro`,s=u(window.scrollY/i)*.25;if(e.top<=0&&(o=n,s=.25+t*.69),a.top<r){let e=u((r-a.top)/Math.max(1,r*.55));s=Math.max(s,.94+e*.06)}a.top<=r*.48&&(o=`next`);let c=U===null?o:Ve[U]??o,l=Be[c];c!==j&&(Ae.textContent=He[S][c]),j=c,x.dataset.activeSection=c,x.dataset.scrollCue=s<.075?`visible`:`hidden`,x.dataset.scrolled=window.scrollY>12?`true`:`false`,ke.style.transform=`scaleX(${ae(l,E.length).toFixed(4)})`,E.forEach((e,t)=>{e.dataset.state=t<l?`complete`:t===l?`active`:`upcoming`,t===l?e.setAttribute(`aria-current`,`step`):e.removeAttribute(`aria-current`)})}function $(){at||=window.requestAnimationFrame(Q)}var Pt=new IntersectionObserver(e=>{e.some(e=>e.isIntersecting)&&jt()},{rootMargin:`55% 0px 55% 0px`,threshold:0}),Ft=new IntersectionObserver(e=>{I=e.some(e=>e.isIntersecting),P?.setActive(I&&!document.hidden)},{threshold:.01});Pt.observe(C),Ft.observe(C),window.addEventListener(`scroll`,At,{passive:!0}),window.addEventListener(`wheel`,()=>X(),{passive:!0}),window.addEventListener(`touchstart`,()=>X(),{passive:!0}),window.addEventListener(`pointerdown`,()=>X(),{passive:!0}),window.addEventListener(`keydown`,e=>{xt.has(e.key)&&X()}),window.addEventListener(`resize`,()=>{let e=window.innerWidth,t=J();if(!(Math.abs(e-yt)>1||Math.abs(t-bt)>1)){$();return}yt=e,bt=t,Je(),je.forEach(e=>{delete e.dataset.panelPosition,e.style.removeProperty(`--chapter-copy-fixed-left`),e.style.removeProperty(`--chapter-copy-fixed-width`)}),D.clear(),O.clear();let n=H;X(!1),window.clearTimeout(R),n!==null&&(R=window.setTimeout(()=>{R=0,Z(Y()[n],K.matches?1:220)},80)),$()},{passive:!0}),window.visualViewport?.addEventListener(`resize`,$,{passive:!0}),document.addEventListener(`visibilitychange`,()=>{P?.setActive(I&&!document.hidden),q()}),w.addEventListener(`tapcam:webgl-unavailable`,()=>{T.hidden=!1}),w.addEventListener(`tapcam:webgl-restored`,()=>{T.hidden=!0,w.hidden=!1}),w.addEventListener(`tapcam:callouts`,e=>{let t=e.detail;it(t.positions,t.opacity,t.bounds)}),window.addEventListener(`pagehide`,e=>{if(X(),mt(),e.persisted){P?.setActive(!1);return}gt.disconnect(),Pt.disconnect(),Ft.disconnect(),P?.dispose()}),window.addEventListener(`pageshow`,e=>{e.persisted&&(Q(),P?.setActive(I&&!document.hidden),q())}),Q();function It(e=!1){let t=E.findIndex(e=>e.hash===window.location.hash);if(t<0){H=null;return}X(),H=t;let n=Y()[t];Z(n,e?1:oe(n-window.scrollY,J()))}if(window.addEventListener(`hashchange`,()=>It()),E.some(e=>e.hash===window.location.hash)){let e=()=>{window.setTimeout(()=>{window.requestAnimationFrame(()=>It(!0))},120)};document.readyState===`complete`?e():window.addEventListener(`load`,e,{once:!0})}export{d as a,h as i,s as n,m as o,p as r,f as s,a as t};