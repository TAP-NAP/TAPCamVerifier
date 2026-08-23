# TAPCam Verifier - UI Navigation & Onboarding Enhancement - Product Requirement Document

## Overview
- **Summary**: 为 TAPCam Verifier 静态 Web 验证器添加固定导航栏、双语（中文/英文）入门引导说明、3D 点云默认视角优化（15° 倾斜让立体效果一眼可见），以及文档/博客/工具/语言切换/GitHub 链接等导航入口。
- **Purpose**: 降低用户首次使用门槛，让用户第一眼就知道这是什么、怎么用；通过倾斜默认视角让 3D 点云的立体感立即可感知，激发用户交互欲望；建立可扩展的导航框架为后续文档（Doc/Blog）铺路。
- **Target Users**: TAPCam 签名照片/Live Photo 的接收方（验证者）、对签名摄影技术感兴趣的技术用户、潜在合作伙伴。

## Goals
- 默认 3D 点云视角绕 X 轴向下倾斜约 15°（俯视），并绕 Y 轴轻微侧转约 5-8°，使用户无需旋转即可感知立体感，同时保留 Reset 按钮回到此初始倾斜视角的能力。
- 页面顶部固定导航栏（sticky/fixed navbar），始终可见。
- 导航栏包含以下入口：Logo（launch_logo.png 小图标 + "TAPCam Verifier" 文字品牌名）、Doc（文档）、Blog（博客）、Tool（工具——即当前验证器本身，激活高亮）、Language（按钮切换：中/英）、GitHub 图标链接。
- 拖放区上方提供简洁的双语入门说明文字，解释这是什么、支持什么格式、如何使用、以及隐私提示。
- 双语（i18n）支持：中文和英文，默认根据浏览器语言自动检测，用户可通过导航栏语言按钮一键切换（无需下拉菜单），切换后页面即时更新。
- Doc/Blog 入口为占位链接，点击后显示 Toast 临时提示"即将上线"，3 秒后自动消失。

## Non-Goals (Out of Scope)
- 不编写白皮书或详细技术文档内容（Doc/Blog 页面内容由用户后续自行补充）。
- 不实现多页面路由——Doc/Blog 入口当前为外部链接占位或简单模态提示，不引入 React Router 等路由库。
- 不改变核心验证逻辑、哈希流程、Rust/WASM 代码。
- 不添加暗色/亮色主题切换（当前浅色主题保持不变）。
- 不实现 About Us 独立页面（GitHub 链接代替）。
- 不引入新的重型 UI 框架，保持现有原生 TypeScript + CSS 方案。

## Background & Context
- 当前项目是一个单页静态 Web 应用，直接在 [index.html](file:///Users/harold/TAPCamVerifier/index.html) 挂载 [main.ts](file:///Users/harold/TAPCamVerifier/src/main.ts)。
- 3D 点云查看器在 [geometryViewer.ts](file:///Users/harold/TAPCamVerifier/src/geometry/geometryViewer.ts) 中，当前 `resetView()` 将相机放在 (0,0,0)，朝向 (0,0,-targetDepth)，up 向量为 (0,1,0)——即正对着点云平面，Z 轴垂直于屏幕，看不出立体感。
- 当前 UI 没有导航栏，只有一个拖放区和结果面板。
- 所有文本硬编码在 [main.ts](file:///Users/harold/TAPCamVerifier/src/main.ts) 和 [rendering.ts](file:///Users/harold/TAPCamVerifier/src/ui/rendering.ts) 中，只有英文。
- 样式全部在 [styles.css](file:///Users/harold/TAPCamVerifier/src/styles.css) 中，使用原生 CSS。
- 项目已有 `src/decorations/` 空目录，按照 README 描述是为未来 UI 层预留的，但目前未使用。

## Functional Requirements
- **FR-1**: 3D 点云默认视角倾斜：当 3D 点云加载时，相机默认位置使点云绕 X 轴向下倾斜约 15°（俯视），同时绕 Y 轴轻微侧转约 5-8°，让近大远小的透视效果和左右纵深差异一眼可见。Reset 按钮应重置到此倾斜视角而非正视角。用户手动旋转相机后，Reset 仍回到此倾斜初始视角。
- **FR-2**: 固定顶部导航栏：页面顶部有一个始终固定（position: fixed 或 sticky; top: 0）在视口顶部的导航栏，包含品牌标识和导航链接，在移动端自适应布局（小字号+紧凑间距，不使用汉堡菜单）。
- **FR-3**: 导航栏入口：导航栏包含：(a) Logo 区域——使用 `public/launch_logo.png` 作为小图标（20-24px），旁边有 "TAPCam Verifier" 文字品牌名，点击回到顶部/刷新初始状态；(b) Doc 链接；(c) Blog 链接；(d) Tool 链接（当前页激活/高亮）；(e) 右侧：Language 切换按钮（显示当前语言"中文"或"EN"，点击即切换）、GitHub 图标链接（内联 SVG 图标）。
- **FR-4**: 入门引导说明：在拖放区域上方增加简洁的说明区域，内容包括：(a) 产品简介——验证 TAPCam 签名照片真实性；(b) 支持格式——HEIC、JPG、Live Photo ZIP；(c) 使用方式——拖放文件到此处或点击选择；(d) 隐私提示——原始照片和视频不会上传到服务器。支持中英双语。
- **FR-5**: 双语国际化 (i18n)：建立轻量 i18n 系统，所有用户可见文本支持中文和英文。默认语言根据 `navigator.language`/`navigator.languages` 检测（zh-CN/zh-TW/zh-HK 等为中文，否则英文）。用户点击导航栏语言按钮一键切换，切换后页面所有文本即时更新，无需刷新。语言切换为按钮直接切换（显示当前语言，点击变为另一种）。
- **FR-6**: Doc/Blog 占位 Toast：Doc 和 Blog 链接点击时不跳转，而是在页面顶部/底部显示一个 Toast 提示条，显示"即将上线 / Coming soon"，3 秒后自动平滑消失。用户可点击 Toast 上的关闭按钮提前关闭。
- **FR-7**: GitHub 链接：导航栏右侧有 GitHub 图标链接（使用内联 SVG GitHub mark 图标），`href="https://github.com/tap-nap/TAPCamVerifier"`，`target="_blank"`，`rel="noopener noreferrer"`。
- **FR-8**: Tool 高亮：导航栏中 "Tool"（工具）项始终处于激活状态，有视觉高亮（如下划线、加粗、或品牌色文字），表明用户当前在工具页面。

## Non-Functional Requirements
- **NFR-1**: 性能：导航栏和 i18n 切换不应引入明显的渲染延迟；3D 点云倾斜视角不影响现有交互性能。
- **NFR-2**: 响应式：导航栏在移动端（≤680px）应正常显示，可采用汉堡菜单或简化布局；说明文字在小屏幕上可读。
- **NFR-3**: 可访问性：导航栏链接有适当的 aria 标签；语言切换按钮有 aria-label；所有交互元素可通过键盘访问。
- **NFR-4**: 一致性：新增 UI 元素的视觉风格（圆角、颜色、字体）与现有设计保持一致。
- **NFR-5**: 零依赖：不引入新的 npm 包；i18n 用轻量自实现方案；不引入路由库。
- **NFR-6**: 向后兼容：所有现有验证功能、测试、WASM 流程完全不受影响。

## Constraints
- **Technical**: TypeScript + Vite + 原生 CSS + Three.js（已有）；不引入新依赖；编译为静态站点部署到 GitHub Pages。
- **Business**: Doc/Blog 内容暂不实现，仅提供入口框架。
- **Dependencies**: 无新增外部依赖；GitHub 链接指向现有公开仓库。

## Assumptions
- 15° 倾斜角是经过验证的"足够看出立体但不至于太偏"的经验值，如果效果不理想可能需要微调（10°-20° 范围内）。
- 用户浏览器语言检测可以通过 `navigator.language` 或 `navigator.languages` 可靠获取。
- Doc/Blog 未来会有独立页面，但当前阶段用占位反馈即可。
- 不需要记住用户的语言偏好（不使用 localStorage 持久化）；如果需要可以后续添加。

## Acceptance Criteria

### AC-1: 3D 点云默认倾斜视角
- **Given**: 用户上传了一张包含有效深度数据的照片，3D 点云面板加载完成
- **When**: 点云首次渲染且用户尚未手动操作相机
- **Then**: 点云呈现约 15° 俯视倾斜 + 轻微侧转（绕 X 轴向下 15°，绕 Y 轴侧转 5-8°），Z 轴深度差异（近大远小）和左右纵深在视觉上明显，用户第一眼能感知这是一个 3D 场景并产生旋转交互的欲望
- **Verification**: `human-judgment`
- **Notes**: 同时 Reset 按钮点击后也应回到此倾斜视角（俯视+侧转），而非正视图。

### AC-2: 固定导航栏存在且始终可见
- **Given**: 用户在任意页面状态（初始页、验证中、验证结果、滚动页面）
- **When**: 页面渲染完成或用户滚动页面
- **Then**: 导航栏固定在视口顶部，始终可见
- **Verification**: `programmatic`

### AC-3: 导航栏包含所有必要入口
- **Given**: 页面已加载
- **When**: 用户查看导航栏
- **Then**: 导航栏包含 Logo/品牌名、Doc、Blog、Tool、Language 切换、GitHub 链接
- **Verification**: `programmatic`

### AC-4: Tool 入口高亮
- **Given**: 用户在验证器页面
- **When**: 导航栏渲染
- **Then**: "Tool" 导航项有视觉上的激活状态（加粗/下划线/背景色等）
- **Verification**: `human-judgment`

### AC-5: 入门引导说明可见
- **Given**: 用户首次打开页面，尚未上传文件
- **When**: 页面加载完成
- **Then**: 拖放区附近有清晰的说明文字，解释产品是什么、支持什么格式、如何操作
- **Verification**: `human-judgment`

### AC-6: 双语支持 - 默认语言检测
- **Given**: 用户浏览器语言设置为中文（zh-CN/zh-TW 等）
- **When**: 页面首次加载
- **Then**: 所有 UI 文本显示为中文
- **Verification**: `programmatic`

### AC-7: 双语支持 - 英文默认
- **Given**: 用户浏览器语言设置为英文或其他非中文语言
- **When**: 页面首次加载
- **Then**: 所有 UI 文本显示为英文
- **Verification**: `programmatic`

### AC-8: 语言切换功能
- **Given**: 页面已加载为任一种语言
- **When**: 用户点击导航栏语言切换按钮并选择另一种语言
- **Then**: 页面上所有用户可见文本立即切换为目标语言，无需页面刷新
- **Verification**: `programmatic`

### AC-9: Doc/Blog 入口 Toast 提示
- **Given**: 页面已加载
- **When**: 用户点击 Doc 或 Blog 链接
- **Then**: 页面出现 Toast 临时提示条，显示"即将上线 / Coming soon"，3秒后自动消失；Toast 有关闭按钮可手动关闭；不跳转页面、不弹出 alert
- **Verification**: `programmatic`

### AC-10: GitHub 链接正确
- **Given**: 页面已加载
- **When**: 用户点击 GitHub 链接
- **Then**: 在新标签页打开 `https://github.com/tap-nap/TAPCamVerifier`
- **Verification**: `programmatic`

### AC-11: 移动端响应式
- **Given**: 视口宽度 ≤ 680px
- **When**: 页面在移动设备上渲染
- **Then**: 导航栏和说明文字布局合理，不溢出、不重叠，可正常使用
- **Verification**: `human-judgment`

### AC-12: 现有功能不受影响
- **Given**: 用户上传有效的签名照片
- **When**: 执行完整验证流程
- **Then**: 本地验证、服务器验证、原图预览、深度可视化、3D 点云、点过滤等所有现有功能正常工作，测试通过
- **Verification**: `programmatic`

### AC-13: 无新增依赖
- **Given**: 项目代码变更完成
- **When**: 检查 package.json
- **Then**: dependencies 和 devDependencies 中没有新增包
- **Verification**: `programmatic`

## Open Questions (Resolved)
- [x] 3D 点云倾斜角度：俯视 15°（绕 X 轴）+ 轻微侧转 5-8°（绕 Y 轴）。
- [x] Doc/Blog 占位交互：Toast 临时提示条，显示"即将上线 / Coming soon"，3 秒自动消失，可手动关闭。
- [x] 语言切换方式：按钮直接切换（显示当前语言，点击切换为另一种），不使用下拉菜单。
- [x] Logo 方案：launch_logo.png 小图标（20-24px）+ "TAPCam Verifier" 文字品牌名。
