# TAPCam Landing 视觉提示词与实现约束

日期：2026-08-15
状态：首版已实现并通过桌面端、移动端与生产构建 QA

这份文档记录本次 Landing Page 最终成立的视觉方向、可复用 Prompt、关键词、信息顺序、动效语法与真实性表述边界。它不是要求后续页面逐像素复制，而是用于维持 TAPCam 对外视觉的一致气质。

## 1. 一句话设计方向

把 TAPCam 表达成一件来自独立研究实验室的“可验证空间相机”：黑色画布、超大中文标题、单色点云、少量荧光色、硬边网格和克制的滚动叙事；年轻、Geek、Web3，但不做廉价赛博朋克，也不做传统企业科技蓝。

## 2. 本次最终采用的信息顺序

1. **TAPCam 是什么、解决什么问题**
   - 首屏只保留真实 Logo、产品名和介绍文字。
   - 先说问题：媒体离开拍摄设备后，来源、完整性与空间上下文很难一起核验。
   - 再说 TAPCam：在同一次捕获中绑定媒体、深度和采集凭证。
2. **立体捕获**
   - 中间是两个明确可辨认的捕获模组/镜头。
   - 右侧是被摄对象。
   - 左侧是同时形成的照片、深度图和向外展开的点云。
3. **绑定与签名**
   - MEDIA、DEPTH、MANIFEST、ATTESTATION 四层先分离展示。
   - 随滚动收拢成一个数据包。
   - 扫描线穿过，签名环闭合，留下清晰的“已经完成签名”停留状态。
4. **公开验证与隐私**
   - 中心是待验证的数据包/证明核心。
   - 周围节点表示任何人都可以访问的验证入口。
   - 去中心化验证与零知识隐私证明只标记为未来研发方向。
5. **下一步入口**
   - 横向三列：Download / Verify / Technology。
   - 使用硬边分栏，不使用卡片圆角。

## 3. 可直接复用的视觉设计 Prompt

```text
为 TAPCam 设计一个现代、年轻、有研究实验室气质的长滚动 Landing Page。

TAPCam 是一台“可验证空间相机”：它在同一次捕获中绑定媒体内容、深度数据和由 App Attest 支持的采集凭证，让原始文件离开相机后，来源、完整性与空间上下文仍能被独立检查。

视觉必须使用纯黑背景。整体气质介于 Three.js 创意实验、独立 Web3 协议网站、技术编辑设计和克制的新粗野主义之间。不要传统中国企业科技官网，不要蓝色发光边框、玻璃拟态、渐变按钮、圆角卡片或堆满 HUD 的廉价赛博朋克。

首屏只展示真实 TAPCam Logo、巨大 TAPCam 字标、一句强有力的中文标题和一小段介绍。不要首屏导航堆叠，不要把所有功能压在一屏。

页面通过向下滚动讲故事，并使用同一个固定的 Three.js / WebGL 舞台：
1. CAPTURE：中间展示两个点云风格的相机捕获模组；右边是被摄对象；左边同时形成 RGB 照片、深度图和从深度图中向外生长的三维点云。
2. BIND & SIGN：MEDIA、DEPTH、MANIFEST、ATTESTATION 四个数据层横向分离，随后随滚动收拢成一个数据包；扫描线经过，签名环闭合，并停留在清晰的已签名状态。
3. OPEN VERIFICATION：被签名的数据包位于中心，周围连接多个公共验证节点；外层用稀疏点云形成隐私边界。把 decentralized verification 和 private proofs / ZK 明确标记为 R&D / future，而不是已经上线的能力。

排版使用超大、紧凑、粗重的中文无衬线标题；技术标签、编号和状态文字使用窄体等宽字体。建立强烈的大小对比和大量黑色留白。画面主要是暖白与黑色，只使用三种强调色：荧光黄绿、珊瑚红、明亮钴蓝。

页面底部设计一个横向三列的硬边入口：01 DOWNLOAD、02 VERIFY、03 TECHNOLOGY。每列使用巨大等宽数字、细边框和独立强调色；悬停时整块变色。保持扁平、直接、无阴影、无圆角。

点云要像真实的 WebGL 三维对象，而不是装饰性粒子背景。动画应由滚动驱动，旋转缓慢，层与层之间有清楚的分解、收拢和封签关系。整体克制、精确、留白充足，让技术对象成为主角。
```

## 4. 可直接复用的实现 Prompt

```text
在现有 Vite + TypeScript + Three.js 项目中实现 TAPCam 长滚动 Landing Page，并保留现有验证器代码不被 Landing 的全局样式或事件监听影响。

使用真正的多页面构建：根路径 `/` 是 Landing，`/verify/` 是现有拖放验证器。不要把两者塞进同一个 SPA 状态，也不要把现有 verifier 入口导入 Landing。

Landing 使用一个 100svh 的 sticky WebGL canvas 和自然页面滚动。滚动进度依次驱动 CAPTURE、BIND & SIGN、OPEN VERIFICATION 三个 Three.js Group 的透明度、位置、旋转与分解/收拢状态。

CAPTURE 场景必须满足明确空间关系：两个相机模组在中间，被摄对象在右侧，照片与深度输出在左侧。深度输出继续展开为点云，使“照片里包含可以探索的深度”一眼可见。

SIGN 场景必须让四层数据先分离，再收拢，并为完整签名状态保留可读停顿，不能在封签完成前淡出。

PRIVACY 场景应把当前能力和未来方向分开：当前是浏览器本地内容绑定检查与明确的服务器验证边界；去中心化验证和 ZK private proofs 是 R&D。

视觉使用硬边、细线、黑色背景和高对比排版，不创建圆角卡片、渐变、玻璃拟态或传统科技蓝发光效果。复用真实 launch_logo.png，不绘制近似 Logo。

为移动端单独调整相机距离和三个场景的缩放，确保左右对象不被裁切。支持 prefers-reduced-motion；限制 devicePixelRatio；只在故事舞台真正进入视口后运行 RAF；处理 ResizeObserver、visibilitychange、pagehide/pageshow 和 WebGL context lost/restored；完整 dispose Three.js 资源。

最终验证 `/`、`/verify/` 和 WASM 资源在生产构建中都能独立访问，并检查桌面、移动端、控制台错误与现有测试。
```

## 5. 核心视觉关键词

### 最重要的一组

- technical editorial
- research-lab interface
- Three.js scrollytelling
- point-cloud camera
- exploded view / 分解图
- depth extrusion / 深度向外生长
- data layers converge
- signature seal
- public verification network
- privacy field
- black canvas
- oversized Chinese typography
- monospace metadata
- hard grid
- flat color
- restrained motion
- high contrast

### 风格气质

- Geek，而不是“商务科技”
- Web3 protocol，而不是“交易所官网”
- Glitch 只作为瞬时信号，不作为全页滤镜
- Neo-brutalist restraint / 克制的新粗野主义
- Experimental but legible / 实验性但必须易读
- Youthful, independent, open-source, auditable
- 少量荧光色，大量黑色留白

### 动效关键词

- scroll-scrubbed
- sticky WebGL stage
- slow orbital motion
- layer separation
- depth bloom
- scan line
- convergence
- signed-state hold
- network expansion
- reduced-motion snap states

## 6. 配色记录

| 角色 | 色值 | 用法 |
| --- | --- | --- |
| Black | `#050505` | 全站背景、舞台背景 |
| Paper | `#F2F0E8` | 主标题、主对象点云 |
| Lime | `#D9FF43` | 深度、进度、研究方向、主要提示 |
| Coral | `#FF5A4F` | 签名、扫描线、第二入口 |
| Cobalt | `#5E78FF` | App Attest、公共验证、第三入口 |
| Muted | `#8F9298` | 正文、辅助信息 |
| Rule | `#292B30` | 网格、边界线、分栏 |

配色原则：强调色不是大面积背景装饰，而是给数据类型和阶段分配稳定语义。页面大部分时间保持黑、暖白与低饱和灰。

## 7. 字体与排版规则

- 中文展示标题：系统无衬线粗体优先，使用 `Inter / SF Pro Display / Helvetica Neue / PingFang SC / Noto Sans CJK SC` 回退链。
- 技术标签与数字：`SFMono-Regular / Roboto Mono / Consolas / ui-monospace`。
- 标题特点：超大、紧凑、负字距、短行、高对比。
- 正文特点：比标题明显更小，灰白色，行高约 `1.7`，宽度受控。
- 元数据特点：全大写、小字号、较宽字距，但必须保持可读对比度。
- 不使用“每段一个大圆角卡片”的信息分组；使用留白、细线和位置关系建立层级。

## 8. 需要长期保留的产品表述边界

推荐表述：

- “让影像的来路与完整性可以被验证。”
- “让媒体带着拍摄凭证离开相机。”
- “媒体、深度与采集凭证绑定在同一次捕获中。”
- “浏览器执行本地内容绑定检查，并把证明材料交给明确的服务器验证边界。”
- “去中心化验证与零知识隐私证明是研发方向。”

避免表述：

- 不说 TAPCam 证明画面中的事件、人物、地点或时间绝对真实。
- 不说 TAPCam 可以证明照片一定不是 AI、Deepfake 或翻拍。
- 不把深度数据描述为“现实真实性”的充分条件。
- 不说当前验证完全去中心化。
- 不说 ZK 已经上线。
- 不说后端接收或重新哈希原始照片；当前描述应保留本地内容绑定检查与服务器凭证验证的边界。

## 9. Negative Prompt / 明确避免

```text
outdated Chinese enterprise website, generic corporate technology landing page,
dark navy dashboard, cyan glow everywhere, blue glass panels, glassmorphism,
rounded cards, pill buttons, gradient CTA, glossy 3D icon pack, stock photography,
generic cyber security shield, fake blockchain coins, crypto exchange aesthetic,
busy HUD overlay, illegible glitch filter, matrix rain, neon city cyberpunk,
all information above the fold, feature-card grid on the hero, oversized navigation,
decorative particles without meaning, random blobs, soft shadows, excessive bloom,
fake product mockup, approximate logo, ungrounded claims about truth or AI detection
```

## 10. 本次参考图中被保留的部分

- `exec-8c135a64-bdb4-4686-84d5-9955043376e5.png`
  - 采用约 `(70.5%, 53.1%)` 的分层、点云和爆炸图意象。
- `exec-af756c29-44b5-4c97-a56f-36446346c563.png`
  - 采用约 `(65%, 52.1%)` 的“照片向深度/点云展开”解释。
- `exec-e36852a0-aa4f-42ea-b5a6-8b4d1580bd06.png`
  - 放弃约 `(19.2%, 26.7%)` 的额外问题说明章节。
  - 采用约 `(63.4%, 92.1%)` 的横向入口展示。

对应实现与对照证据见：

- `src/landing.css`
- `src/landing.ts`
- `src/landingScene.ts`
- `design-qa.md`
- `Docs/Assets/LandingQA/reference-comparison.png`

## 11. 为什么这套方向成立

1. **首屏克制**：先建立品牌与一句核心认知，不急着解释全部协议。
2. **技术变成可见关系**：不是用卡片列出 RGB、Depth、App Attest，而是让它们在空间中分离、收拢和签名。
3. **字体承担品牌性格**：超大中文标题提供态度，等宽小字提供研究工具感。
4. **颜色具有语义**：Lime 对应深度/研究，Coral 对应签名，Cobalt 对应凭证/公共验证。
5. **滚动就是叙事顺序**：用户不需要先读白皮书，也能依次理解捕获、绑定、验证和未来隐私方向。
6. **避免过度承诺**：宣传性文案有张力，但不会把“凭证与完整性”偷换成“绝对真实”。

## 12. 下一阶段可继续加强的部分

- 获得最终工业设计后，用正式 TAPCam GLB/GLTF 替换当前概念点云相机模组。
- 为真实照片建立更贴近 TAPCam 输出的 RGB / depth / point-cloud 过渡资产。
- 在不改变信息顺序的前提下，继续优化滚动节奏、封签停留时间和移动端对象比例。
- 后续 About、Technology 或 Whitepaper 页面继续沿用同一字体、配色和硬边网格，但信息密度可以更高。
