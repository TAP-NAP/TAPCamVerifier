# TAPCam Verifier - UI Navigation & Onboarding Enhancement - Verification Checklist

## 3D 点云视角优化
- [x] 3D 点云首次加载时默认呈现约 15° 俯视倾斜 + 7.2° 侧转角度，立体感明显
- [x] 点击 "Reset view" 按钮后视角回到倾斜+侧转初始状态（而非正视图）
- [x] 用户手动旋转/缩放/平移后，Reset 仍能正确回到初始倾斜+侧转视角
- [x] 3D 点云交互（旋转、缩放、平移、点过滤）功能与之前一致，无回归

## 导航栏
- [x] 页面顶部存在固定导航栏（position: fixed, z-index: 100），滚动时始终可见，不遮挡内容
- [x] 导航栏 Logo 使用 launch_logo.png 小图标 + "TAPCam Verifier" 文字
- [x] 导航栏包含 Doc 按钮入口（点击显示Toast）
- [x] 导航栏包含 Blog 按钮入口（点击显示Toast）
- [x] 导航栏包含 Tool 链接，且始终处于激活/高亮状态（--active class）
- [x] 导航栏包含语言切换按钮（中文模式显示"EN"，英文模式显示"中文"，点击直接切换）
- [x] 导航栏包含 GitHub 图标链接（内联 SVG），指向 https://github.com/Harold002/TAPCamVerifier，在新标签页打开
- [x] 点击 Doc 显示 Toast 临时提示"即将上线 / Coming soon"，3秒自动消失，可手动关闭
- [x] 点击 Blog 显示 Toast 临时提示"即将上线 / Coming soon"，3秒自动消失，可手动关闭
- [x] Toast 有平滑的淡入动画效果
- [x] 导航栏不遮挡页面内容（body padding-top: 56px）
- [x] 导航栏视觉风格与现有设计系统一致（白色背景、毛玻璃效果、底部细边框、现代简洁）

## 双语国际化 (i18n)
- [x] 浏览器语言为中文时，页面默认显示中文
- [x] 浏览器语言为英文/其他时，页面默认显示英文
- [x] 点击语言切换按钮可在中文和英文之间切换
- [x] 切换语言后页面所有文本即时更新，无需刷新
- [x] 导航栏文本双语正确（Doc/文档、Blog/博客、Tool/工具等）
- [x] 拖放区文本双语正确
- [x] 入门说明文字双语正确
- [x] 验证状态文本双语正确（verifying/验证中、valid/验证通过、invalid/验证失败等）
- [x] 深度面板标签双语正确（Source/来源、Size/尺寸、Range/范围等）
- [x] 3D 点云面板标签双语正确（Points/点数、Camera Model/相机模型、Filter/过滤等）
- [x] 3D 点云过滤器控件文本双语正确（Sensitivity/灵敏度、Show/显示、Hide/隐藏、Highlight/高亮等）
- [x] 验证成功模态框文本双语正确
- [x] 本地点检查摘要标签双语正确（Capture ID、Captured At、Format 等）
- [x] 错误/警告中的技术字符串和元数据值（capture ID、文件名、哈希值）保持原样不翻译
- [x] package.json 无新增依赖
- [x] html lang 属性随语言切换自动更新

## 入门引导说明
- [x] 首次打开页面时，拖放区上方有清晰的说明文字
- [x] 说明文字介绍产品功能（验证 TAPCam 签名照片真实性）
- [x] 说明文字列出支持格式（HEIC、JPG、Live Photo ZIP）
- [x] 说明文字解释使用方式（拖放或点击上传）
- [x] 说明文字包含隐私提示（原始照片不上传服务器）
- [x] 说明文字支持双语切换（三卡片标题和内容均双语）
- [x] 说明文字不干扰拖放功能（拖放和点击上传均正常工作）
- [x] dropzone简化（移除重复的h1标题，保留操作提示）

## 移动端响应式
- [x] 在 ≤680px 宽度（手机端）导航栏布局合理，不溢出、不错位
- [x] 手机端导航链接可读可点击（缩小字号但不消失）
- [x] 手机端品牌文字自动隐藏节省空间
- [x] 手机端入门说明文字可读，三卡片变单栏
- [x] 手机端拖放区、验证结果、深度面板、3D 面板正常显示
- [x] 手机端 3D 点云过滤器面板在小屏幕上正常显示

## 功能回归验证
- [x] `npm run typecheck` 无 TypeScript 错误
- [x] `npx vitest run` 全部通过（8 test files, 37 tests）
- [x] `npm run build` 构建成功，dist/ 正确生成
- [x] WASM 模块构建正常（build:wasm 成功）
- [x] 浏览器中手动验证通过（导航栏、onboarding、语言切换、Toast均正常）
- [x] 无控制台应用错误
