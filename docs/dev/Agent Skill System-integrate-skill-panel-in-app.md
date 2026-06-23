# 开发文档: T9 - 在 App.tsx 中集成 SkillPanel

**Project:** Agent Skill System
**Task ID:** T9
**Slug:** `integrate-skill-panel-in-app`
**Issue:** #82
**类型:** frontend
**Batch:** 4
**依赖:** T8 (#80) — SkillPanel UI 组件

---

## 1. 目标

修改 `src/entrypoints/sidepanel/App.tsx`，在 Header 区域添加"技能管理"入口按钮，点击后以模态弹窗形式打开 `SkillPanel`。

## 2. 前置条件

| 依赖 | 状态 | 说明 |
|------|------|------|
| T8 `SkillPanel.tsx` | 依赖中 | 位于 `src/entrypoints/sidepanel/components/SkillPanel.tsx`，导出 `SkillPanel` 组件 |
| T3 `SkillStore` | 依赖中 | `SkillPanel` 内部自行引用，App.tsx 不直接依赖 |

> **假设:** T8 完成后，`SkillPanel` 组件位于 `src/entrypoints/sidepanel/components/SkillPanel.tsx`，Props 为 `{ onClose: () => void }`。

## 3. 现有代码分析

### 3.1 App.tsx 结构概览

```
App (外层)
└── ErrorBoundary
    └── ChatProvider
        └── ChatLayout (核心)
            ├── Header (L124-133)
            │   ├── "BrowserAgent" 标题
            │   ├── AgentStatusIndicator
            │   └── <div className="w-10" /> (占位)
            ├── Main (L136-180)
            │   ├── ConversationSidebar
            │   ├── ChatView + MessageInput
            │   └── TokenPanel
            ├── SettingsPanel (条件渲染, L183-194)
            └── ConfirmDialog (条件渲染, L197-203)
```

### 3.2 Header 区域精确代码 (L124-133)

```tsx
<header className="h-10 border-b border-hairline bg-canvas flex items-center justify-between px-4 shrink-0">
  <div className="flex items-center gap-3">
    <span className="text-sm font-semibold text-ink tracking-wide">
      BrowserAgent
    </span>
  </div>
  <AgentStatusIndicator />
  <div className="w-10" />
</header>
```

当前 Header 使用 `justify-between` 布局，三个子元素形成 左-中-右 分布。右侧的 `<div className="w-10" />` 是一个无内容的占位符，用于保持 `AgentStatusIndicator` 居中。

### 3.3 现有模态弹窗模式 (L182-194)

```tsx
{showSettings && (
  <SettingsPanel
    providers={providers}
    agentSettings={agentSettings}
    expertMode={expertMode}
    onSaveProviders={handleSaveProviders}
    onSaveAgentSettings={handleSaveAgentSettings}
    onSaveExpertMode={handleSaveExpertMode}
    onTestConnection={handleTestConnection}
    onClose={() => setShowSettings(false)}
  />
)}
```

`SkillPanel` 应完全复用此模式：通过一个 `boolean` state 控制显示/隐藏。

## 4. 改动方案

### 4.1 改动点汇总

| # | 位置 | 操作 | 说明 |
|---|------|------|------|
| 1 | L7 附近（import 区域） | 新增 import | `import { SkillPanel } from './components/SkillPanel';` |
| 2 | L42 附近（state 声明区域） | 新增 state | `const [showSkillPanel, setShowSkillPanel] = useState(false);` |
| 3 | L130 附近（Header 内部，`<div className="w-10" />` 之前） | 新增按钮 | 添加 "Skills" 入口按钮 |
| 4 | L194 之后（`{showSettings && ...}` 之后） | 新增条件渲染 | `{showSkillPanel && <SkillPanel onClose={() => setShowSkillPanel(false)} />}` |

### 4.2 精确改动指引

#### 改动 1: 新增 import（在第 7 行后插入）

在第 7 行 `import { SettingsPanel } from './components/SettingsPanel';` 之后新增一行：

```typescript
import { SkillPanel } from './components/SkillPanel';
```

#### 改动 2: 新增 state（在第 42 行后插入）

在第 42 行 `const [showSettings, setShowSettings] = useState(false);` 之后新增一行：

```typescript
const [showSkillPanel, setShowSkillPanel] = useState(false);
```

#### 改动 3: Header 区域新增 Skills 按钮

**当前代码 (L124-133):**

```tsx
<header className="h-10 border-b border-hairline bg-canvas flex items-center justify-between px-4 shrink-0">
  <div className="flex items-center gap-3">
    <span className="text-sm font-semibold text-ink tracking-wide">
      BrowserAgent
    </span>
  </div>
  <AgentStatusIndicator />
  <div className="w-10" />
</header>
```

**改为:**

```tsx
<header className="h-10 border-b border-hairline bg-canvas flex items-center justify-between px-4 shrink-0">
  <div className="flex items-center gap-3">
    <span className="text-sm font-semibold text-ink tracking-wide">
      BrowserAgent
    </span>
  </div>
  <AgentStatusIndicator />
  <div className="flex items-center gap-2">
    <button
      type="button"
      data-testid="skill-panel-trigger"
      onClick={() => setShowSkillPanel(true)}
      className="text-xs text-mute hover:text-ink transition-colors"
    >
      Skills
    </button>
    <div className="w-10" />
  </div>
</header>
```

**设计决策:**
- 保留 `<div className="w-10" />` 占位，确保 `AgentStatusIndicator` 仍然居中
- 按钮放在占位元素左侧，两者用 `gap-2` 分组
- 按钮样式与 Header 整体风格一致：`text-xs text-mute hover:text-ink`（与 Sidebar 底部 `[+] 设置` 按钮风格一致）

#### 改动 4: 新增 SkillPanel 条件渲染（在 SettingsPanel 之后）

在第 194 行 `)}`（SettingsPanel 条件渲染结束）之后，`{/* Confirm Dialog */}` 注释之前，新增：

```tsx
{/* Skill Panel */}
{showSkillPanel && (
  <SkillPanel onClose={() => setShowSkillPanel(false)} />
)}
```

### 4.3 完整 diff 预览

```diff
--- a/src/entrypoints/sidepanel/App.tsx
+++ b/src/entrypoints/sidepanel/App.tsx
@@ -5,6 +5,7 @@ import { ChatView } from './components/ChatView';
 import { MessageInput } from './components/MessageInput';
 import { ConversationSidebar } from './components/ConversationSidebar';
 import { TokenPanel } from './components/TokenPanel';
 import { SettingsPanel } from './components/SettingsPanel';
+import { SkillPanel } from './components/SkillPanel';
 import { ConfirmDialog } from './components/ConfirmDialog';
 import { ErrorBoundary } from './ErrorBoundary';
 import { ConfigStore } from '@/shared/storage';
@@ -39,6 +40,7 @@ function ChatLayout() {
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const [tokenCollapsed, setTokenCollapsed] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
+  const [showSkillPanel, setShowSkillPanel] = useState(false);
 
   // Settings state (persisted via ConfigStore → browser.storage.local)
@@ -128,7 +130,14 @@ function ChatLayout() {
         </div>
         <AgentStatusIndicator />
-        <div className="w-10" />
+        <div className="flex items-center gap-2">
+          <button
+            type="button"
+            data-testid="skill-panel-trigger"
+            onClick={() => setShowSkillPanel(true)}
+            className="text-xs text-mute hover:text-ink transition-colors"
+          >
+            Skills
+          </button>
+          <div className="w-10" />
+        </div>
       </header>
 
       {/* Main */}
@@ -192,6 +201,12 @@ function ChatLayout() {
         />
       )}
 
+      {/* Skill Panel */}
+      {showSkillPanel && (
+        <SkillPanel onClose={() => setShowSkillPanel(false)} />
+      )}
+
       {/* Confirm Dialog */}
       {confirmRequest && (
         <ConfirmDialog
```

## 5. 交互行为说明

```
用户点击 Header "Skills" 按钮
  → setShowSkillPanel(true)
  → <SkillPanel> 渲染为模态弹窗（z-50 遮罩层）
  → 用户操作 Skill CRUD（由 SkillPanel 内部管理）
  → 用户点击 SkillPanel 关闭按钮 ✕
  → onClose 回调触发 → setShowSkillPanel(false)
  → SkillPanel 卸载，遮罩消失
  → 用户可再次点击 "Skills" 按钮打开
```

关键保证：
- `showSkillPanel` 仅控制显隐，不持有 SkillPanel 的任何内部状态
- 每次打开都是全新的 SkillPanel 实例（React 条件渲染特性），或复用但通过 `useEffect` 重新加载数据（由 SkillPanel 内部 `useEffect` + `SkillStore.onChange` 保证）
- 关闭后 state 重置为 `false`，按钮始终可用

## 6. 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | Header 区域显示 "Skills" 入口按钮 | 肉眼检查 Header 右侧，按钮位于占位元素左侧 |
| 2 | 点击按钮打开 SkillPanel 模态弹窗 | 点击 → 弹窗出现，遮罩覆盖整个 viewport |
| 3 | 关闭弹窗后按钮仍可用（可再次打开） | 关闭 → 再次点击 → 弹窗再次出现 |
| 4 | 不影响现有 UI 布局 | `BrowserAgent` 标题仍在左侧，`AgentStatusIndicator` 仍在中间 |
| 5 | `data-testid="skill-panel-trigger"` 可被定位 | `screen.getByTestId('skill-panel-trigger')` |

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/entrypoints/sidepanel/App.tsx` | 修改 | 4 处改动（见 4.2 节） |

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| `SkillPanel` 组件文件不存在（T8 未完成） | import 报错，编译失败 | T9 必须在 T8 完成后执行；如并行开发，可先用占位组件 stub |
| Header 空间不足（小窗口） | 按钮可能被挤压 | 按钮只有 "Skills" 6 个字符 + text-xs，占用空间极小 |
| SkillPanel 内部状态在关闭后未清理 | 下次打开显示旧数据 | SkillPanel 内部 `useEffect` 在 mount 时重新调用 `getAll()`，天然解决此问题 |

## 9. 与现有功能的共存

- **与 SettingsPanel 不冲突:** `showSettings` 和 `showSkillPanel` 是两个独立 state，理论上可以同时打开（z-index 都是 z-50，后打开的覆盖在前）。实际使用中用户不会同时打开两个弹窗。
- **与 ConversationSidebar 不冲突:** Header 的 Skills 按钮与 Sidebar 底部的 `[+] 设置` 按钮互不干扰。
- **与 TokenPanel 不冲突:** 无交互关联。
