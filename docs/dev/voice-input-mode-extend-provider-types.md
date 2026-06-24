# 开发文档: T1 - 扩展 ProviderConfig/ProviderFormData 增加 sttModel 字段

**Project:** voice-input-mode
**Task ID:** T1
**Slug:** extend-provider-types
**Issue:** #94
**类型:** fullstack
**Batch:** 1
**依赖:** 无

## 1. 目标

在 `ProviderConfig` 和 `ProviderFormData` 接口中新增可选字段 `sttModel?: string`，用于存储每个 Provider 配置的语音转文字（STT）模型名称（如 `whisper-1`）。未配置此字段的 Provider 不支持语音功能。

## 2. 前置条件

- 无外部依赖
- 需要理解当前 Provider 配置的数据流：
  - `ProviderConfig`（`src/shared/types/llm.ts`）— 运行时 Provider 配置
  - `ProviderFormData`（`src/entrypoints/sidepanel/types.ts`）— 设置面板表单状态
  - `SettingsPanel.tsx`（`src/entrypoints/sidepanel/components/SettingsPanel.tsx`）— Provider 编辑表单，包含 `ProviderConfig` ↔ `ProviderFormData` 双向映射逻辑

## 3. 实现步骤

### 3.1 扩展 `ProviderConfig` 接口

**文件：** `src/shared/types/llm.ts`

在 `ProviderConfig` 接口中添加 `sttModel` 字段，放在 `isDefault` 字段之前或之后均可（建议放在 `timeoutMs` 之后、`isDefault` 之前，与字段分组逻辑一致）：

```typescript
export interface ProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  /** STT 语音识别模型（可选，如 whisper-1），不填则不支持语音功能 */
  sttModel?: string;   // ← 新增
  isDefault?: boolean;
}
```

**变更点：** 在 `timeoutMs?: number;` 和 `isDefault?: boolean;` 之间插入 `sttModel?: string;`（含 JSDoc 注释）。

### 3.2 扩展 `ProviderFormData` 接口

**文件：** `src/entrypoints/sidepanel/types.ts`

在 `ProviderFormData` 接口中添加 `sttModel` 字段，放在 `isLocalTrusted` 之后：

```typescript
export interface ProviderFormData {
  id?: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalTrusted: boolean;
  /** STT 语音识别模型（可选） */
  sttModel?: string;   // ← 新增
}
```

### 3.3 同步 SettingsPanel 中的 ProviderFormData ↔ ProviderConfig 映射

**文件：** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

该组件有 3 处需要同步变更：

#### 3.3.1 `defaultForm` 初始化（第 32-38 行）

当前：
```typescript
const defaultForm: ProviderFormData = {
  name: '',
  endpoint: '',
  apiKey: '',
  model: '',
  isLocalTrusted: false,
};
```

由于 `sttModel` 是可选字段，`defaultForm` **无需显式设置**。新增 Provider 时 `sttModel` 为 `undefined`，表示不启用语音功能。此处的变更可选（不加也能编译通过）。

#### 3.3.2 `handleSaveProvider` 中 `ProviderFormData → ProviderConfig`（第 42-49 行）

当前：
```typescript
const newProvider: ProviderConfig = {
  id: editing.id ?? crypto.randomUUID(),
  name: editing.name,
  endpoint: editing.endpoint,
  apiKey: editing.apiKey,
  model: editing.model,
  isLocalTrusted: editing.isLocalTrusted,
};
```

变更后：
```typescript
const newProvider: ProviderConfig = {
  id: editing.id ?? crypto.randomUUID(),
  name: editing.name,
  endpoint: editing.endpoint,
  apiKey: editing.apiKey,
  model: editing.model,
  isLocalTrusted: editing.isLocalTrusted,
  sttModel: editing.sttModel,   // ← 新增
};
```

#### 3.3.3 编辑按钮中的 `ProviderConfig → ProviderFormData`（第 146-155 行）

当前：
```typescript
onClick={() =>
  setEditing({
    id: p.id,
    name: p.name,
    endpoint: p.endpoint,
    apiKey: p.apiKey,
    model: p.model,
    isLocalTrusted: p.isLocalTrusted,
  })
}
```

变更后：
```typescript
onClick={() =>
  setEditing({
    id: p.id,
    name: p.name,
    endpoint: p.endpoint,
    apiKey: p.apiKey,
    model: p.model,
    isLocalTrusted: p.isLocalTrusted,
    sttModel: p.sttModel,   // ← 新增
  })
}
```

#### 3.3.4 表单 UI：新增 STT Model 输入框（可选）

在编辑表单中（第 201 行 `isLocalTrusted` checkbox 之后、第 210 行保存按钮之前）增加 STT 模型输入框：

```tsx
<input
  data-testid="provider-stt-model-input"
  placeholder="STT 模型（可选，如 whisper-1）"
  value={editing.sttModel ?? ''}
  onChange={(e) => setEditing({ ...editing, sttModel: e.target.value || undefined })}
  className="w-full px-2 py-1.5 text-sm border border-hairline rounded-md bg-canvas text-ink placeholder:text-mute focus:outline-none focus:border-primary"
/>
```

**注意：** 空字符串转 `undefined` 确保不保存空值，与"不启用语音功能"的语义一致。

## 4. 接口/契约

### 4.1 新增接口

无新增 API。此任务仅扩展内部类型定义。

### 4.2 数据模型变更

无数据库/存储 schema 变更。`sttModel` 作为 `ProviderConfig` 的一部分，通过现有的 `config-store` 持久化（`extraHeaders`、`timeoutMs` 等可选字段已有先例）。

## 5. 测试指引

### 5.1 类型编译检查

```bash
npx tsc --noEmit
```

预期结果：零错误。验证新增字段在所有引用处类型兼容。

### 5.2 现有单元测试

```bash
npx vitest run
```

预期结果：所有现有测试通过。关键检查点：
- `src/shared/types/__tests__/llm.test.ts` — ProviderConfig 类型测试不受影响
- `src/provider/__tests__/llm-client.test.ts` — LlmClient 不依赖 `sttModel`，测试不变
- `src/entrypoints/sidepanel/__tests__/` — SettingsPanel 相关组件测试不受影响

### 5.3 手动验证点

由于 `sttModel` 是纯类型扩展且 UI 输入框为可选字段，手动验证重点：
- 打开设置面板 → Provider 标签页
- 添加/编辑 Provider，确认 STT 模型输入框正常显示
- 保存后重新打开设置，确认 STT 模型值正确回显
- 不填 STT 模型时，保存的 Provider 不应包含空字符串（应为 `undefined`）

## 6. 验收标准

- [ ] `ProviderConfig` 包含 `sttModel?: string` 字段（`src/shared/types/llm.ts`）
- [ ] `ProviderFormData` 包含 `sttModel?: string` 字段（`src/entrypoints/sidepanel/types.ts`）
- [ ] `SettingsPanel.tsx` 中 `ProviderConfig ↔ ProviderFormData` 映射包含 `sttModel`
- [ ] 编辑表单包含 STT 模型输入框（`data-testid="provider-stt-model-input"`）
- [ ] 空字符串转 `undefined` 逻辑正确
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过

## 7. 注意事项

- **可选字段语义：** `sttModel` 为 `undefined` 表示不支持语音功能，与值为 `""` 不同。`onChange` 处理中必须将空字符串转为 `undefined`。
- **SettingsPanel 中的 3 处映射：** `defaultForm`、`handleSaveProvider`、编辑按钮 `onClick`，缺少任何一处都会导致编译错误或数据丢失。
- **向后兼容：** 已有 Provider 数据不包含 `sttModel` 字段，读取时为 `undefined`，逻辑自然兼容。
- **潜在风险：** 本任务仅扩展类型和表单，不涉及实际的 STT API 调用逻辑。若后续任务需要根据 `sttModel` 调用 Whisper API，需注意端点构造和 API Key 使用（通常与 Chat Completions 共享同一 Key 和 Base URL）。
