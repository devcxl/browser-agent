# 开发文档: T3 - SettingsPanel 增加 STT 模型输入框

**Project:** voice-input-mode
**Task ID:** T3
**Slug:** settings-stt-model
**Issue:** #96
**类型:** frontend
**Batch:** 2
**依赖:** T1 (#94) — 已完成 `ProviderConfig.sttModel` 和 `ProviderFormData.sttModel` 类型扩展

---

## 1. 目标

在 Provider 编辑表单中新增 `sttModel` 文本输入框，支持用户为每个 Provider 配置语音转文字（STT）模型名称，并在 Provider 列表卡片中展示该字段。

---

## 2. 前置条件

- [x] **T1 已完成**：`ProviderConfig` 和 `ProviderFormData` 均包含 `sttModel?: string` 字段
  - `src/shared/types/llm.ts` — `ProviderConfig.sttModel?: string`
  - `src/entrypoints/sidepanel/types.ts` — `ProviderFormData.sttModel?: string`
- [x] `SettingsPanel.tsx` 的 Provider 编辑表单逻辑已就绪（`src/entrypoints/sidepanel/components/SettingsPanel.tsx`）
- [x] 测试基础设施就绪：`vitest` + `jsdom` + `@testing-library/react` + `userEvent`

---

## 3. 实现步骤

### 3.1 修改 `defaultForm` 默认值

**文件:** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

在第 32-38 行的 `defaultForm` 对象中增加 `sttModel: ''`：

```tsx
const defaultForm: ProviderFormData = {
  name: '',
  endpoint: '',
  apiKey: '',
  model: '',
  isLocalTrusted: false,
  sttModel: '',   // 新增
};
```

**关键点：** `sttModel` 是可选的语音模型配置，默认为空字符串表示未配置。保存按钮的 disabled 校验 **不** 需要包含 `sttModel`（用户可以不填）。

---

### 3.2 在编辑表单渲染区增加 `sttModel` 输入框

**文件:** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

在 `model` 输入框（第 195-201 行）之后、`isLocalTrusted` checkbox（第 202 行）之前，插入 `sttModel` 输入框：

```tsx
{/* 插入在 model 输入框之后 */}
<input
  data-testid="provider-stt-model-input"
  placeholder="语音模型 (e.g. whisper-1)"
  value={editing.sttModel ?? ''}
  onChange={(e) => setEditing({ ...editing, sttModel: e.target.value })}
  className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
/>
```

**关键点：**
- `data-testid="provider-stt-model-input"` 用于测试定位
- `value={editing.sttModel ?? ''}` — 使用 `??` 确保 `undefined` 时显示空字符串（T1 将 `sttModel` 定义为 `?: string`）
- 样式类与现有 `model` 输入框完全一致
- 位置：放在 `model` 输入框和 `isLocalTrusted` checkbox 之间

---

### 3.3 修改 `handleSaveProvider` 写入 `sttModel`

**文件:** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

在第 40-56 行的 `handleSaveProvider` 函数中，将 `editing.sttModel` 写入 `newProvider`：

```tsx
const handleSaveProvider = () => {
  if (!editing) return;
  const newProvider: ProviderConfig = {
    id: editing.id ?? crypto.randomUUID(),
    name: editing.name,
    endpoint: editing.endpoint,
    apiKey: editing.apiKey,
    model: editing.model,
    isLocalTrusted: editing.isLocalTrusted,
    sttModel: editing.sttModel || undefined,   // 新增：空字符串转为 undefined
  };
  if (editing.id) {
    onSaveProviders(providers.map((p) => (p.id === editing.id ? newProvider : p)));
  } else {
    onSaveProviders([...providers, newProvider]);
  }
  setEditing(null);
};
```

**关键点：**
- `editing.sttModel || undefined` — 空字符串转为 `undefined`，避免持久化无意义空字符串。`ProviderConfig.sttModel` 是 `?: string`，不设值等同于不配置语音模型。
- 保存按钮的 disabled 条件 **不** 需要修改（第 215 行），`sttModel` 是可选的。

---

### 3.4 修改"编辑"按钮的 `setEditing` 同步 `sttModel`

**文件:** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

在第 146-155 行的编辑按钮 `onClick` 中，同步拷贝 `p.sttModel`：

```tsx
onClick={() =>
  setEditing({
    id: p.id,
    name: p.name,
    endpoint: p.endpoint,
    apiKey: p.apiKey,
    model: p.model,
    isLocalTrusted: p.isLocalTrusted,
    sttModel: p.sttModel ?? '',   // 新增：回显到表单
  })
}
```

**关键点：**
- `p.sttModel ?? ''` — 将 `undefined` 转为空字符串，确保表单输入框正常显示（`ProviderConfig.sttModel` 可能为 `undefined`）
- 与 3.3 的 `|| undefined` 形成对称：**持久化时空串→undefined，回显时 undefined→空串**

---

### 3.5 在 Provider 列表卡片中显示 `sttModel`

**文件:** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

在第 128 行的 `endpoint / model` 显示行之后，添加条件渲染的 `sttModel` 显示行：

```tsx
{/* 现有：endpoint / model */}
<div className="text-xs text-mute truncate">{p.endpoint} / {p.model}</div>

{/* 新增：sttModel，仅当有值时显示 */}
{p.sttModel && (
  <div className="text-xs text-mute truncate mt-0.5">
    🎤 语音模型: {p.sttModel}
  </div>
)}
```

**关键点：**
- `{p.sttModel && (...)}` — 仅当有值时显示，避免无意义的空行
- `mt-0.5` — 与上方行保持 2px 间距
- 使用 🎤 emoji 作为视觉标识，与语音输入功能呼应
- 样式与现有 `endpoint / model` 行保持一致

---

## 4. 接口/契约

### 4.1 数据模型（T1 已完成，此处为参考）

```typescript
// src/shared/types/llm.ts — ProviderConfig
export interface ProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  sttModel?: string;        // T1 新增
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  isDefault?: boolean;
}

// src/entrypoints/sidepanel/types.ts — ProviderFormData
export interface ProviderFormData {
  id?: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  sttModel?: string;        // T1 新增
}
```

### 4.2 数据转换规则

| 方向 | 规则 | 位置 |
|------|------|------|
| `ProviderConfig` → `ProviderFormData`（编辑回显） | `sttModel: p.sttModel ?? ''` | 编辑按钮 onClick |
| `ProviderFormData` → `ProviderConfig`（保存） | `sttModel: editing.sttModel \|\| undefined` | handleSaveProvider |
| 表单默认值 | `sttModel: ''` | defaultForm |

---

## 5. 测试指引

### 5.1 测试文件

**文件:** `src/entrypoints/sidepanel/__tests__/SettingsPanel.test.tsx`（新建）

### 5.2 测试框架

- `vitest` + `@testing-library/react` + `@testing-library/user-event`
- 使用 `vi.fn()` mock props 回调
- 渲染 `<SettingsPanel>` 时需提供所有必需的 props

### 5.3 Props 接口

```typescript
// SettingsPanel 的 Props（完整）
interface Props {
  providers: ProviderConfig[];
  agentSettings: AgentSettings;
  expertMode: ExpertModeSettings;
  onSaveProviders: (providers: ProviderConfig[]) => void;
  onSaveAgentSettings: (s: AgentSettings) => void;
  onSaveExpertMode: (e: ExpertModeSettings) => void;
  onTestConnection: (provider: ProviderConfig) => Promise<boolean>;
  onClose: () => void;
}
```

### 5.4 测试用例

#### 用例 1: sttModel 输入框渲染

```typescript
it('编辑表单应包含语音模型输入框', async () => {
  // 点击"添加 Provider"进入编辑模式
  // 验证 data-testid="provider-stt-model-input" 存在
  // 验证 placeholder="语音模型 (e.g. whisper-1)"
});
```

**预期结果：** 输入框存在于编辑表单中，placeholder 正确。

#### 用例 2: 新增 Provider 时可填写 sttModel

```typescript
it('新增 Provider 时应可填写 sttModel 并保存', async () => {
  // 点击"添加 Provider"
  // 填写 name、endpoint、apiKey、model（必填项）
  // 填写 sttModel = "whisper-1"
  // 点击"保存"
  // 验证 onSaveProviders 被调用，参数中 newProvider.sttModel === "whisper-1"
});
```

**预期结果：** `onSaveProviders` 收到的 ProviderConfig 数组包含正确的 `sttModel`。

#### 用例 3: 不填 sttModel 时保存为空

```typescript
it('不填 sttModel 时保存的 ProviderConfig 应不含 sttModel 字段', async () => {
  // 点击"添加 Provider"
  // 填写 name、endpoint、apiKey、model
  // sttModel 留空
  // 点击"保存"
  // 验证 onSaveProviders 被调用，参数中 newProvider.sttModel 为 undefined
});
```

**预期结果：** `newProvider.sttModel` 为 `undefined`（空字符串转为 undefined）。

#### 用例 4: 编辑已有 Provider 时回显 sttModel

```typescript
it('编辑已有 Provider 时应回显 sttModel', async () => {
  // 渲染 SettingsPanel，传入 providers=[{ sttModel: "whisper-1", ... }]
  // 点击"编辑"按钮
  // 验证 sttModel 输入框的 value 为 "whisper-1"
});
```

**预期结果：** 输入框预填 `"whisper-1"`。

#### 用例 5: 编辑时修改 sttModel 并保存

```typescript
it('编辑已有 Provider 时应可修改 sttModel', async () => {
  // 渲染 SettingsPanel，传入 providers=[{ sttModel: "whisper-1", ... }]
  // 点击"编辑"
  // 清空 sttModel 输入框，输入 "whisper-2"
  // 点击"保存"
  // 验证 onSaveProviders 被调用，sttModel 更新为 "whisper-2"
});
```

**预期结果：** `onSaveProviders` 收到更新后的 `sttModel`。

#### 用例 6: Provider 列表卡片显示 sttModel

```typescript
it('Provider 列表卡片应在有 sttModel 时显示语音模型信息', async () => {
  // 渲染 SettingsPanel，传入 providers=[{ sttModel: "whisper-1", ... }]
  // 验证卡片中显示 "🎤 语音模型: whisper-1"
});
```

**预期结果：** 卡片中显示语音模型信息。

#### 用例 7: sttModel 为空时不显示

```typescript
it('Provider 列表卡片应在无 sttModel 时不显示语音模型信息', async () => {
  // 渲染 SettingsPanel，传入 providers=[{ sttModel: undefined, ... }]
  // 验证卡片中不包含 "🎤 语音模型:"
});
```

**预期结果：** 卡片中不显示语音模型相关文本。

#### 用例 8: sttModel 为空字符串时保存为 undefined

```typescript
it('sttModel 输入框值为空时保存应转为 undefined', async () => {
  // 点击"添加 Provider"
  // 填写必填项，sttModel 输入空格后清空
  // 点击"保存"
  // 验证 onSaveProviders 收到的 newProvider.sttModel === undefined
});
```

**预期结果：** `newProvider.sttModel` 为 `undefined`。

### 5.5 构建 mock props 的辅助函数

```typescript
function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    providers: [],
    agentSettings: {
      maxToolRounds: 10,
      maxContextMessages: 50,
      systemPrompt: '',
      reasoningEffort: 'medium',
    },
    expertMode: { enabled: false, switches: {} },
    onSaveProviders: vi.fn(),
    onSaveAgentSettings: vi.fn(),
    onSaveExpertMode: vi.fn(),
    onTestConnection: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    ...overrides,
  };
}
```

### 5.6 运行测试

```bash
# 运行 SettingsPanel 全部测试
npx vitest run src/entrypoints/sidepanel/__tests__/SettingsPanel.test.tsx

# 开发模式
npx vitest src/entrypoints/sidepanel/__tests__/SettingsPanel.test.tsx

# 运行全部测试确认无回归
npx vitest run
```

---

## 6. 验收标准

- [ ] Provider 编辑表单包含 `data-testid="provider-stt-model-input"` 的"语音模型"输入框
- [ ] 新增 Provider 时可填写 `sttModel`，保存后写入 `ProviderConfig.sttModel`
- [ ] 编辑已有 Provider 时 `sttModel` 正确回显
- [ ] 编辑后可修改 `sttModel` 并保存
- [ ] 保存时空字符串转为 `undefined`
- [ ] Provider 列表卡片在有 `sttModel` 值时显示 `🎤 语音模型: xxx`
- [ ] Provider 列表卡片在无 `sttModel` 时不显示语音模型信息
- [ ] 单元测试覆盖 sttModel 字段的渲染、编辑、保存、展示（≥8 个用例）
- [ ] 现有全部测试通过（`npx vitest run`）

---

## 7. 注意事项

### 7.1 边界情况

| 场景 | 处理方式 |
|------|----------|
| `sttModel` 为空字符串 | 保存时转为 `undefined`（`\|\| undefined`） |
| `sttModel` 为 `undefined`（老数据） | 编辑回显时转为空字符串（`?? ''`），卡片不显示 |
| `sttModel` 包含空格 | 不做 trim 处理，原样保存（用户可能有特殊需求如 `"whisper-1-v2"`） |
| 保存按钮 disabled 逻辑 | **不修改**，`sttModel` 是可选的，不影响必填校验 |

### 7.2 与 T1 的兼容性

- T1 将 `ProviderConfig.sttModel` 和 `ProviderFormData.sttModel` 都定义为 `?: string`
- T3 的所有逻辑都基于 `?: string` 设计，使用 `??` 和 `||` 处理 undefined
- 如果 T1 未完成时执行 T3，TypeScript 编译会报错（缺少 `sttModel` 属性），这是预期行为

### 7.3 风险点

| 风险 | 影响 | 对策 |
|------|------|------|
| `sttModel` 输入框插入位置错误 | UI 布局异常 | 严格放在 `model` 输入框和 `isLocalTrusted` checkbox 之间 |
| 空字符串持久化污染 storage | 存储中出现无意义的 `sttModel: ""` | 使用 `|| undefined` 在保存时清理 |
| 老版本数据无 `sttModel` 字段 | 列表卡片异常 | 使用 `p.sttModel &&` 条件渲染，`undefined` 不会报错 |
| SettingsPanel 测试文件不存在 | 需要新建完整的测试文件 | 参考 `MessageInput.test.tsx` 的测试模式，提供完整的 mock props |

---

## 8. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/entrypoints/sidepanel/components/SettingsPanel.tsx` | 修改 | 5 处改动（详见 §3） |
| `src/entrypoints/sidepanel/__tests__/SettingsPanel.test.tsx` | 新建 | 单元测试（≥8 个用例） |

---

## 9. 改动位置速查

| # | 位置（当前行号） | 改动类型 | 说明 |
|---|-----------------|----------|------|
| 1 | L37（defaultForm 内） | 新增 1 行 | `sttModel: ''` |
| 2 | L195-L201 之后 | 新增 8 行 | `sttModel` 输入框 |
| 3 | L48（handleSaveProvider 内） | 新增 1 行 | `sttModel: editing.sttModel \|\| undefined` |
| 4 | L152（编辑按钮 setEditing） | 新增 1 行 | `sttModel: p.sttModel ?? ''` |
| 5 | L128 之后 | 新增 5 行 | 卡片条件渲染 `sttModel` |
