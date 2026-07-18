# ADR: Provider 就绪度驱动首次聊天引导

- **日期**: 2026-07-18
- **状态**: Proposed
- **决策者**: Felix
- **相关**: [聊天首次体验与响应式布局技术方案](../dev/specs/chat-first-run-experience.md)

---

## 背景

`ProviderWizard` 目前独占模型校验逻辑，`ChatLayout` 只检查 Provider 是否存在。结果是残缺 Provider 会让聊天输入无可用模型，但用户无法获得自动修复引导。

产品要求在没有完整 Provider 时每次启动自动打开一次可关闭向导；关闭后同一运行周期不得再次打扰，重新打开插件后仍未完成则再次提示。API Key 不应成为完成条件，以支持本地和自建无鉴权服务。

## 决策

1. 提取纯函数 `provider-readiness.ts`，集中定义模型合法性与 Provider 就绪度。
2. 完整 Provider 定义为：存在非空 `api` 或 `endpoint`，且至少一个模型合法；不检查 API Key、Provider 名称或 `isLocalTrusted`。
3. `ChatLayout` 从原始 Provider 数组派生 `completeProviders`；聊天选择和发送只使用该列表，设置面板仍显示全部配置。
4. 自动引导由 `ChatLayout` 管理的内存状态实现。存储加载完成且没有完整 Provider 时，每个 Side Panel 挂载周期只自动打开一次。
5. 有残缺 Provider 时，预填第一个残缺项：Endpoint 缺失进入 Connection，否则进入 Models；无 Provider 时进入 Template。
6. 自动引导的 modal 直接承载 `ProviderWizard`，不通过 `SettingsPanel` 传递状态。

## 替代方案

### 方案 A：只在 Provider 数组为空时引导

不采用。不能修复已有但残缺的配置，也无法确保聊天可用。

### 方案 B：要求 API Key 才算完成

不采用。会永久阻止 Ollama、vLLM 和其他无鉴权端点完成引导。

### 方案 C：持久化“已关闭引导”标记

不采用。与“下次启动仍未完成则再次打开”冲突，并会造成用户遗忘配置入口。

### 方案 D：由 SettingsPanel 承载自动引导

不采用。需要扩展 Settings 的 tab、编辑项和关闭来源状态，增加不必要耦合。

## 影响

- `ProviderWizard` 新增可选 `initialStep`，原有设置入口不传该参数，行为保持不变。
- `ChatLayout` 需要区分 Provider 加载前、无完整 Provider、存在完整 Provider 三个状态。
- 保存 Provider 后必须同步当前 Provider、Model、Reasoning 选择，避免需要刷新或二次选择。
- 新增完整性、一次性弹出、CTA 重开、残缺配置路由等测试。

## 后续行动

1. 实现纯函数并让 Wizard 与 App 复用模型合法性规则。
2. 实现引导 dialog 的焦点进入、关闭恢复和 overlay 互斥。
3. 验证无 API Key 的 OpenAI-compatible Provider 保存后可立即发起聊天。
