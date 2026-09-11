# TAPCamVerifier

[English](README.md) | 简体中文

## 用途

TAPCamVerifier 是一个静态验证网站，支持已签名的 TAPCam HEIC/JPG 照片、
TAP Video MP4 和 `.tapnap` 采集包。它支持 Live Photo 验证；缺少配对 MOV 时，
仍可验证主照片范围。

浏览器检查产物完整性，并请求服务端验证 App Attest assertion。原始媒体留在浏览器中。
照片深度图、相对 3D 视图和视频深度同步播放是独立的查看工具。

## 使用

打开[验证页面](https://www.tapnap.net/verify/)，选择或拖入支持的文件。
单独的 MOV 缺少主产物的 manifest 和 proof，不能独立验证。

### 本地开发

安装 `nvm` 和 `rustup` 后，执行：

```sh
nvm use
rustup show
npm ci
npm run dev
```

[.nvmrc](.nvmrc) 固定 Node `22.23.2`；
[rust-toolchain.toml](rust-toolchain.toml) 固定 Rust `1.98.0` 和
`wasm32-unknown-unknown` 目标。开发命令先构建 WASM，再在 `127.0.0.1` 启动
Vite；在 Vite 输出的地址后打开 `/verify/`。

### 检查与生产构建

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

这些 [package 脚本](package.json) 依次运行 Rust 测试与 Vitest、检查 TypeScript、
构建 WASM 和静态网站到 `dist/`，再在本地预览构建产物。
`npm run build` 本身也包含 TypeScript 检查。

可选的设备样本 `test/tap-depth-photo.HEIC` 和 `test/tap-depth-photo.JPG`
不纳入 Git；缺少文件时，相应解码测试会跳过，不能据此确认设备兼容性。
更新契约版本时，应将 [src/video/tapVideo.test.ts](src/video/tapVideo.test.ts)
和 [src/video/fixtures/](src/video/fixtures/) 中的镜像向量与
[固定版本的契约向量](https://github.com/TAP-NAP/TAPArtifactContracts/tree/16242f01674d5c8b771b93e2cb46bc42a039d174/examples/vectors)核对。

### 部署

将仓库的 GitHub Pages 发布来源设为 **GitHub Actions**。
[工作流](.github/workflows/deploy-pages.yml) 在推送到 `main` 或手动触发时测试并构建，
将 `dist/` 部署到 Pages，同时独立把同一产物发布到 `ecs-web` 分支。
如果 `main` 已前进，则跳过该次产物分支发布。源码修改应放在 `main`，不直接修改产物分支。

[服务端部署工具](https://github.com/TAP-NAP/server/tree/main/deploy)提供
`tap update web`，从该分支安装网站到 ECS，无需在 ECS 编译前端。
产物中的 `.tap-source` 记录对应源码提交。
验证接口地址定义在 [src/verifier/serverVerify.ts](src/verifier/serverVerify.ts)；
服务端必须可访问，并允许页面的 origin，本地开发地址也需要相应许可。

<a name="verification-flow"></a>

## 简要原理

1. 解析输入，并执行文件与压缩包的资源限制。
2. 照片和 Live Photo 使用 Rust/WASM，TAP Video 使用 TypeScript，
   对签名覆盖的原始字节及原始 manifest payload 计算哈希，重建签名绑定。
3. 本地绑定通过后，仅将 `keyId`、`assertionObject` 和 `signingBinding`
   发送至服务端，验证 App Attest assertion。
4. 展示已验证的资源范围与服务端结果；最终有效要求两项检查均通过。
   网络失败与绑定失败分别报告。

[绑定契约](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/bindings/capture-binding-and-proof-v1.md#local-reconstruction-and-cryptographic-verification)
规定字节覆盖范围和 Live Photo 验证范围；
[后端契约](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/BackendContract.md#tapcam-capture-signature-verification)
规定 HTTP 请求与响应。媒体解码、时间戳、深度质量、校准可用性和可视化结果不决定签名是否有效；
无法使用的深度样本只影响其视图。验证不证明场景真实、作者身份、时间、地点或非 AI 来源，
详见[对外声明边界](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/ProductContract.md#7-claim-boundaries)。

本地输入策略限制每个文件最大 512 MiB、包内每个媒体条目最大 384 MiB，并另有限制压缩包展开的预算。
裸 MP4 与包内 MP4 使用同一验证器。Rust 读取器接受带填充的 base64url，
并忽略 proof 头中非零的保留字节；生产端仍须按固定契约输出无填充的 base64url 和零保留字节。
共享传输格式见[采集包契约](https://github.com/TAP-NAP/TAPArtifactContracts/blob/16242f01674d5c8b771b93e2cb46bc42a039d174/transport/tapnap-v1.md)。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `index.html` | 首页入口。 |
| `verify/` | 验证页面入口。 |
| `privacy/` | 隐私页面入口。 |
| `src/` | 页面编排、共享展示、样式及就近放置的测试。 |
| `src/input/` | 照片、视频与采集包解析，以及输入资源限制。 |
| `src/original/` | 原图展示与 HEIC 主图解码回退。 |
| `src/depth/` | 辅助深度发现与解码。 |
| `src/geometry/` | 相对点投影、过滤与 Three.js 查看器。 |
| `src/video/` | TAP Video 字节验证、契约向量与深度播放。 |
| `src/verifier/` | HTTP 验证请求与服务端边界诊断。 |
| `src/wasm/` | WASM 加载与照片、Live Photo 验证接口。 |
| `src/ui/` | 验证和可视化渲染，以及共享控件。 |
| `src/i18n/` | 翻译与语言偏好。 |
| `src/landing/` | 首页交互。 |
| `src/assets/` | 打包使用的视觉素材。 |
| `crates/tapcam-verifier-wasm/` | Rust 照片与 Live Photo 字节验证、媒体辅助处理及样本 CLI。 |
| `scripts/` | WASM 构建与资源复制脚本。 |
| `public/` | 静态资源、域名配置与构建生成的兼容 WASM 副本。 |
| `.github/workflows/` | 测试、静态构建、Pages 部署与 `ecs-web` 发布。 |

## 仓库依赖

[TAPArtifactContracts](https://github.com/TAP-NAP/TAPArtifactContracts)
是产物格式、绑定规则、后端 API 行为和产品声明的唯一规范来源。
本实现以已审阅的
[`16242f01674d5c8b771b93e2cb46bc42a039d174`](https://github.com/TAP-NAP/TAPArtifactContracts/commit/16242f01674d5c8b771b93e2cb46bc42a039d174)
为基准，并保留上文列出的本地读取兼容行为。

[TAPCamDemo](https://github.com/TAP-NAP/TAPCamDemo) 生产可互操作的采集产物；
[server](https://github.com/TAP-NAP/server) 实现运行时调用的 App Attest HTTP 服务，
并提供 ECS 部署工具。两者都不是规范来源，也不需要检出到本地才能构建此网站。

构建依赖声明在 [package.json](package.json) 和
[Cargo.toml](crates/tapcam-verifier-wasm/Cargo.toml)，并有纳入版本控制的锁文件。
Rust `attestation_assertion_verifier` 仓库是服务端的代码依赖，不链接进本网站的 WASM 模块。
