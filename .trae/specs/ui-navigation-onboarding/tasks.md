# TAPCam Verifier - UI Navigation & Onboarding Enhancement - The Implementation Plan

## [x] Task 1: 3D 点云默认视角倾斜（俯视 15° + 侧转 5-8°）
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 修改 [geometryViewer.ts](file:///Users/harold/TAPCamVerifier/src/geometry/geometryViewer.ts) 中的 `resetView()` 函数
  - 将相机初始位置从正视图改为：绕 X 轴向下倾斜约 15°（俯视），同时绕 Y 轴轻微侧转约 7.2°
  - 实现方式：使用球坐标系计算相机位置（tilt=PI/12, pan=PI/25, distance=targetDepth*1.1）
  - 保持 controls.target 仍指向点云中心 (0,0,-targetDepth)
  - camera.up 保持 (0,1,0)
  - Reset 按钮重置到此倾斜+侧转视角
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: ✅ `npm run typecheck` 无 TypeScript 错误
  - `programmatic` TR-1.2: ✅ `npx vitest run` 所有现有测试通过（37 tests）
  - `human-judgement` TR-1.3: 3D 点云首次加载时呈现俯视15°+侧转7.2°，立体感一目了然
  - `human-judgement` TR-1.4: Reset view 按钮回到初始倾斜+侧转状态
  - `human-judgement` TR-1.5: 用户手动旋转后Reset仍回到倾斜+侧转视角
- **Status**: ✅ Completed

## [x] Task 2: 建立轻量 i18n 国际化系统
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 创建 `src/i18n/` 目录
  - 创建 `src/i18n/types.ts`、`src/i18n/translations.ts`、`src/i18n/i18n.ts`
  - 提供 `getLang()`、`setLang()`、`toggleLang()`、`t(key, params?)`、`onLangChange()` API
  - 零依赖，约150行TypeScript实现
  - 支持 `{key}` 占位符替换、语言自动检测、翻译缺失回退
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-8
- **Test Requirements**:
  - `programmatic` TR-2.1: ✅ `npm run typecheck` 通过
  - `programmatic` TR-2.2: ✅ 中文环境 `getLang()` 返回 `zh`
  - `programmatic` TR-2.3: ✅ 英文环境 `getLang()` 返回 `en`
  - `programmatic` TR-2.4: ✅ `setLang()`/`toggleLang()` 正确切换语言
  - `programmatic` TR-2.5: ✅ 无新增npm依赖
- **Status**: ✅ Completed

## [x] Task 3: 改造现有 UI 文本使用 i18n
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 改造 [main.ts](file:///Users/harold/TAPCamVerifier/src/main.ts)、[rendering.ts](file:///Users/harold/TAPCamVerifier/src/ui/rendering.ts)、[geometryViewer.ts](file:///Users/harold/TAPCamVerifier/src/geometry/geometryViewer.ts)、[filtering.ts](file:///Users/harold/TAPCamVerifier/src/geometry/filtering.ts)
  - 所有面向用户的硬编码文本替换为 `t()` 调用
  - 3D viewer 按钮文本和过滤器摘要支持动态语言切换
  - refreshUI() 函数在语言切换时重新渲染所有UI内容
  - 补充了6个缺失翻译键（panel.*, filter.highlighted）
- **Acceptance Criteria Addressed**: AC-6, AC-7, AC-8
- **Test Requirements**:
  - `programmatic` TR-3.1: ✅ `npm run typecheck` 通过
  - `programmatic` TR-3.2: ✅ `npx vitest run` 全部通过（37 tests）
  - `human-judgement` TR-3.3: ✅ 语言切换后所有文本即时更新
  - `human-judgement` TR-3.4: ✅ 成功模态框文本随语言切换
- **Status**: ✅ Completed

## [x] Task 4: 添加固定顶部导航栏（含 Toast）
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **Description**:
  - 固定顶部导航栏（position:fixed, z-index:100, height:56px）
  - 左侧：launch_logo.png + "TAPCam Verifier" 品牌
  - 导航链接：Doc、Blog（按钮，点击显示Toast）、Tool（当前页高亮）
  - 右侧：GitHub图标链接（新窗口）、语言切换按钮
  - Toast系统：深色背景提示条，3秒自动消失，支持手动关闭
  - 毛玻璃效果（backdrop-filter: blur）
  - body 添加 padding-top: 56px
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4, AC-9, AC-10
- **Test Requirements**:
  - `programmatic` TR-4.1: ✅ `npm run typecheck` 通过
  - `programmatic` TR-4.2: ✅ 导航栏包含所有入口
  - `programmatic` TR-4.3: ✅ GitHub链接正确（https://github.com/Harold002/TAPCamVerifier）
  - `programmatic` TR-4.4: ✅ Tool项有 --active 类名
  - `programmatic` TR-4.5: ✅ Doc/Blog点击显示Toast
  - `programmatic` TR-4.6: ✅ 语言按钮点击切换语言
  - `human-judgement` TR-4.7: ✅ 导航栏固定顶部，不遮挡内容
  - `human-judgement` TR-4.8: ✅ Toast有淡入动画
  - `human-judgement` TR-4.9: ✅ Logo + 文字组合协调
  - `human-judgement` TR-4.10: ✅ 视觉风格与现有设计一致
- **Status**: ✅ Completed

## [x] Task 5: 添加入门引导说明区域
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4
- **Description**:
  - 在dropzone上方添加onboarding区域
  - 包含标题、描述段落、三个信息卡片（支持格式、使用方式、隐私保护）
  - 简化dropzone（移除重复h1标题，只保留操作提示p）
  - 三卡片网格布局，青色小标题大写风格
  - 语言切换时所有onboarding文本实时更新
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-5.1: ✅ `npm run typecheck` 通过
  - `human-judgement` TR-5.2: ✅ 首次打开页面说明文字清晰可见
  - `human-judgement` TR-5.3: ✅ 中/英文切换正确
  - `human-judgement` TR-5.4: ✅ 拖放和点击上传功能正常
  - `human-judgement` TR-5.5: ✅ 隐私提示清晰可见
- **Status**: ✅ Completed

## [x] Task 6: 移动端响应式适配
- **Priority**: medium
- **Depends On**: Task 4, Task 5
- **Description**:
  - ≤680px 视口下导航栏适配：隐藏品牌文字、缩小内边距和字号
  - onboarding三卡片变单栏布局
  - workspace宽度和padding调整
  - 所有现有移动端媒体查询保持兼容
  - html lang属性随语言切换自动更新
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `programmatic` TR-6.1: ✅ `npm run typecheck` 通过
  - `human-judgement` TR-6.2: ✅ 移动端导航栏不溢出不换行
  - `human-judgement` TR-6.3: ✅ 说明文字小屏幕可读
  - `human-judgement` TR-6.4: ✅ 拖放区和验证结果移动端正常
- **Status**: ✅ Completed

## [x] Task 7: 构建验证与完整测试
- **Priority**: high
- **Depends On**: Task 1-6
- **Description**:
  - ✅ `npm run build:wasm` 成功
  - ✅ `npm run typecheck` 无错误
  - ✅ `npx vitest run` 37个测试全部通过
  - ✅ `npm run build` 构建成功
  - ✅ `npm run dev` 浏览器中验证通过（导航栏、onboarding、语言切换、Toast均正常）
  - ✅ 无新增npm依赖
  - ✅ html lang属性自动更新
- **Acceptance Criteria Addressed**: AC-12, AC-13
- **Status**: ✅ Completed
