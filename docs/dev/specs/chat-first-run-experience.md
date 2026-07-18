# 聊天首次体验与响应式布局技术方案

> 状态：Proposed
> 日期：2026-07-18
> 关联：[#161 优化聊天首次体验与响应式布局](https://github.com/devcxl/browser-agent/issues/161)
> 上游 PRD：[chat-first-run-experience.md](../../prd/chat-first-run-experience.md)

## 1. 目标与边界

本方案解决首次聊天页与已有对话页的内容宽度不一致、聊天配置项使用原生下拉、无完整 Provider 时缺少引导三个问题。

不修改 `ProviderConfig` 存储结构、Agent/LLM 调用链、Provider 网络请求或设置页其他控件。实现仅位于 Side Panel 的 UI 和配置派生逻辑，不新增 npm 依赖。

## 2. 当前架构与问题

`ChatLayout` 位于 `src/entrypoints/sidepanel/App.tsx`，在启动时加载和迁移 `providers`，并持有当前 Provider、Model、Reasoning 选择状态。

```text
ConfigStore -> ChatLayout.providers -> MessageInput -> Agent.run
                                  -> SettingsPanel -> ProviderWizard
```

当前问题：

| 区域          | 当前实现                        | 问题                                         |
| ------------- | ------------------------------- | -------------------------------------------- |
| 首页          | 直接使用 `px-6` 的全宽主区域    | 与已有聊天页不对齐                           |
| 消息流        | `ChatView` 内部 `max-w-3xl`     | 1440px 以上过窄                              |
| 聊天输入      | 外层再次使用 `max-w-3xl`        | 与首页、消息流规则分离                       |
| 配置选择      | 三个原生 `<select>`             | 系统弹层不随主题，无法满足菜单定位和键盘验收 |
| 无 Provider   | `activeProvider` 为空时输入禁用 | 未向用户说明原因，也未触发配置流程           |
| Provider 校验 | `ProviderWizard` 私有校验       | App 无法一致判断完整性和残缺步骤             |

## 3. 决策摘要

| 决策     | 选择                                  | 原因                                                   |
| -------- | ------------------------------------- | ------------------------------------------------------ |
| 内容宽度 | 一个共享 `ChatContentContainer`       | 消除首页、消息流和输入框规则漂移                       |
| 选择器   | 本地无依赖 `ChatSelect`               | 只服务三个聊天配置项，避免组件库和包体增量             |
| 菜单定位 | Portal + `position: fixed`            | 不受输入框和聊天容器的 `overflow` 裁剪，可实现上下翻转 |
| 完整性   | 从 Wizard 抽取纯函数                  | 让保存、自动引导和聊天可用性共用模型校验语义           |
| 自动引导 | `ChatLayout` 内存状态机               | 每次 Side Panel 挂载尝试一次，关闭不持久化             |
| 引导承载 | App 直接渲染 modal + `ProviderWizard` | 不耦合 `SettingsPanel` 的 tab、编辑和关闭状态          |

## 4. 目标架构

```text
ConfigStore
    |
    v
ChatLayout
    |- providerReadiness.ts
    |    |- completeProviders
    |    `- firstIncompleteProvider + initialStep
    |
    |- ChatContentContainer
    |    |- Home: title + MessageInput + suggestions
    |    `- Chat: ChatView + MessageInput
    |
    |- MessageInput
    |    `- ChatSelect x3 (Provider / Model / Reasoning)
    |
    `- Onboarding dialog
         `- ProviderWizard(initialStep)
```

### 4.1 文件边界

| 文件                                                            | 变更                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/entrypoints/sidepanel/App.tsx`                             | 加载完成标记、完整 Provider 派生、引导状态机、CTA、共享容器接入 |
| `src/entrypoints/sidepanel/components/ChatView.tsx`             | 移除内部固定最大宽度，接收共享容器包裹                          |
| `src/entrypoints/sidepanel/components/MessageInput.tsx`         | 使用 `ChatSelect`，保留 Provider/Model/Reasoning 联动           |
| `src/entrypoints/sidepanel/components/ChatContentContainer.tsx` | 新增响应式内容容器                                              |
| `src/entrypoints/sidepanel/components/ChatSelect.tsx`           | 新增聊天范围可访问 Listbox                                      |
| `src/entrypoints/sidepanel/components/ProviderWizard.tsx`       | 接受 `initialStep`，复用完整性函数，接入 i18n                   |
| `src/entrypoints/sidepanel/provider-readiness.ts`               | 新增 Provider/Model 完整性纯函数                                |
| `src/entrypoints/sidepanel/i18n/types.ts`                       | 扩展消息 schema                                                 |
| `src/entrypoints/sidepanel/locales/zh-CN.json`                  | 新增中文文案                                                    |
| `src/entrypoints/sidepanel/locales/en.json`                     | 新增英文文案                                                    |

`SettingsPanel` 继续编辑全部 Provider；其调用 `ProviderWizard` 时不传 `initialStep`，现有行为不变。

## 5. 共享响应式内容容器

新增无状态组件 `ChatContentContainer`，只定义宽度和水平边距，不拥有滚动、背景或垂直布局职责。

```tsx
interface ChatContentContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ChatContentContainer({ children, className }: ChatContentContainerProps) {
  return (
    <div
      className={cn('w-full mx-auto px-4 sm:px-6 lg:w-[90%] lg:px-0 min-[1440px]:w-3/4', className)}
    >
      {children}
    </div>
  );
}
```

| 可用视口      | 容器规则                               |
| ------------- | -------------------------------------- |
| `<1024px`     | `w-full`，保留 `px-4 sm:px-6` 安全边距 |
| `1024–1439px` | `w-[90%]`，无额外水平 padding          |
| `>=1440px`    | `w-3/4`，无固定 `max-width`            |

接入规则：

1. 首页主区域以容器包裹标题、`MessageInput` 和建议卡片。
2. `ChatView` 保持全高可滚动外层；其消息列由容器包裹。
3. 聊天输入保留全宽背景与顶边框；仅输入框本体由容器包裹。
4. 移除 `ChatView` 和聊天输入外层的 `max-w-3xl`，避免多处宽度来源。

## 6. 聊天配置下拉

### 6.1 `ChatSelect` 契约

```ts
interface ChatSelectOption {
  value: string;
  label: string;
}

interface ChatSelectProps {
  id: string;
  label: string;
  value: string;
  options: ChatSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}
```

`MessageInput` 保持受控状态和既有回调：

- Provider 选择调用 `onSelectProvider`，由 `ChatLayout` 重置 Model 与 Reasoning。
- Model 选择调用 `onSelectModel`，由 `ChatLayout` 重置 Reasoning。
- Reasoning 选择调用 `onReasoningEffortChange`；空值代表关闭。
- 不支持 Reasoning 时继续显示不可交互状态，不创建空菜单。

### 6.2 交互与可访问性

- 触发器为原生 `button`，使用 `role="combobox"`、`aria-expanded`、`aria-controls` 和 `aria-activedescendant`。
- 菜单为 `role="listbox"`，选项为 `role="option"` 和 `aria-selected`。
- 三个实例共享 `openSelectId`，同一时刻只允许一个菜单打开。
- 打开菜单后，当前值为活动项；`ArrowUp`、`ArrowDown` 循环移动活动项；`Enter` 选择；`Escape` 关闭；点击外部关闭。
- 关闭后将焦点还给触发器。菜单关闭、选择及组件卸载时移除全局事件监听。

### 6.3 Portal 定位

菜单用 `createPortal(..., document.body)` 渲染并使用 `position: fixed`：

1. 打开时读取触发器 `getBoundingClientRect()`。
2. 下方空间可容纳最小菜单高度时向下展开，否则向上展开。
3. `max-height` 为当前方向可用高度减去安全间距，菜单内部 `overflow-y-auto`。
4. 在 `resize`、捕获阶段的 `scroll` 及打开时重新计算位置。

这避免聊天容器和 Side Panel 的 `overflow-hidden` 裁剪菜单，同时保持 Chrome/Firefox 一致行为。

## 7. Provider 完整性与引导状态

### 7.1 纯函数

新增 `provider-readiness.ts`，集中校验但不读写存储：

```ts
export type ProviderWizardStep = 'connection' | 'models';

export function isProviderModelValid(model: ProviderModelConfig): boolean;

export function getProviderReadiness(provider: ProviderConfig): {
  isComplete: boolean;
  initialStep: ProviderWizardStep | null;
};
```

规则：

- Endpoint 为 `provider.api?.trim() || provider.endpoint?.trim()`。
- 模型合法性严格沿用当前 Wizard 条件：`id`、`name` 非空，`context > output > 0`，默认输出 `>0` 且不超过 `output`。
- Provider 至少有一个合法模型且 Endpoint 非空才完整。
- API Key、`isLocalTrusted`、Provider 名称不是完整性条件。
- Endpoint 缺失时优先返回 `connection`；否则无合法模型时返回 `models`。

`ProviderWizard` 继续要求保存时所有已填写模型都合法；这是编辑完整性的现有约束，不能错误改成“存在一个合法模型即可保存”。

### 7.2 `ChatLayout` 派生状态

```ts
const [providersLoaded, setProvidersLoaded] = useState(false);
const [autoWizardAttempted, setAutoWizardAttempted] = useState(false);
const [onboardingRequest, setOnboardingRequest] = useState<{
  provider?: ProviderConfig;
  initialStep?: ProviderWizardStep;
  returnFocus?: HTMLElement | null;
} | null>(null);

const completeProviders = providers.filter((provider) => getProviderReadiness(provider).isComplete);
```

- `providersLoaded` 仅在读取和迁移完成后设为 `true`。失败时按空数组处理并仍可配置自定义端点。
- 聊天可选 Provider、`activeProvider` 和初始选择只使用 `completeProviders`。
- 设置面板仍使用原始 `providers`，确保残缺项可见、可编辑。
- 初始选择首个完整 Provider 及其默认或首个合法 Model；不存在完整项时置空。

### 7.3 自动引导状态机

```text
Loading
  | providersLoaded
  v
Ready + completeProviders non-empty ------> Chat ready
  |
  | no complete provider and !autoWizardAttempted
  v
Open onboarding once
  |- no provider --------------------------> Template step
  |- first incomplete provider, no endpoint -> Connection step
  `- first incomplete provider, bad models -> Models step
  |
  |- close --> Disabled home + CTA (same mount does not auto-open again)
  `- save complete provider --> Chat ready
```

`autoWizardAttempted` 仅保存于 React 内存。因此同一次 Side Panel 挂载中关闭向导不会再次自动弹出；重新打开 Side Panel 后状态重置，若仍无完整 Provider 则再次尝试，符合“每次启动一次”的产品定义。

CTA 复用相同 `onboardingRequest` 构建逻辑。保存后，`handleSaveProviders` 持久化配置、选中新保存的完整 Provider、默认或首个合法 Model、对应默认 Reasoning，并关闭向导。

### 7.4 引导弹窗

App 直接将 `ProviderWizard` 包在新的轻量 modal 容器，不经 `SettingsPanel` 间接打开：

- 背景层提供 `role="dialog"`、`aria-modal="true"` 和可本地化标题。
- 打开时焦点进入 dialog；关闭时恢复到记录的 CTA 或设置按钮，自动打开没有来源时回退设置按钮。
- `Escape` 与关闭按钮均只关闭本次引导，不写持久化“已引导”标记。
- 引导弹窗与设置面板不得并存；打开引导前关闭设置面板，打开设置面板时关闭引导。

## 8. 国际化

扩展 `MessageSchema` 并同时更新 `zh-CN.json` 与 `en.json`。新 key 分为：

| 命名空间                   | 内容                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `chat.configuration`       | Provider、Model、Reasoning 标签，Think 开关和不支持状态        |
| `chat.onboarding`          | 无配置说明、CTA、dialog 标题                                   |
| `settings.provider.wizard` | 模板、连接、模型步骤，字段、按钮、校验、发现模型结果和失败提示 |

`ProviderWizard` 改用 `useI18n()`；不新增语言检测或存储逻辑。语言包的 schema 强制保证中英文 key 同步。

## 9. 测试策略

### 9.1 单元测试

| 模块                    | 用例                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `provider-readiness.ts` | `api`/`endpoint` 任一有效、无 API Key 仍完整、空模型、非法模型、一个合法模型、Endpoint 缺失优先 Connection |
| `ChatSelect`            | ARIA 属性、点击、上下键、Enter、Escape、外部点击、焦点恢复、禁用、内部滚动与上下翻转定位                   |

### 9.2 组件与集成测试

| 模块                   | 用例                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `MessageInput`         | 三个原生 select 被替换；Provider/Model 联动未回归；Reasoning Unsupported 保留                          |
| `ProviderWizard`       | `initialStep` 生效；新旧入口默认步骤不变；目录失败时自定义端点仍可选；中英文文案切换                   |
| `App`/`ChatLayout`     | 加载前无提示和向导；仅自动打开一次；CTA 重开；残缺项进入正确步骤；保存后启用输入、建议卡片并选中新配置 |
| `ChatContentContainer` | 首页、消息流和输入框使用同一个容器类，聊天页不再包含 `max-w-3xl`                                       |

现有依赖原生 `<option>` 的断言改为按 `combobox`、`listbox`、`option` role 与用户交互断言。

### 9.3 构建与人工验收

```bash
npm run test:run
npm run typecheck
npm run lint
npm run build:chrome
npm run build:firefox
```

人工检查视口 `390/768/1024/1366/1440/1920/2560px`，Provider 状态（无、残缺、完整），Light/Dark/System，中英文以及菜单贴近视口底部时的向上展开。

## 10. ADR 兼容性

现有 [AI SDK v7 迁移 ADR](../../adr/2026-07-17-ai-sdk-migration.md) 将 Chat UI 列为持续迁移区域，但要求 `ProviderConfig` 和存储格式保持不变。本方案：

- 不改 Agent、`ToolLoopAdapter`、`useAgent` 或 AI SDK 消息格式。
- 不改 `ProviderConfig`、`ConfigStore` 或 Provider 网络层。
- 不新增依赖，符合该 ADR 对浏览器扩展包体积的约束。
- 仅使用当前 React、Tailwind、i18n 和 ProviderWizard 接口，因此可独立交付，不阻塞 AI SDK 迁移。

没有发现与既有 ADR 的冲突。

## 11. 风险与缓解

| 风险                               | 缓解                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| 第一个 Provider 残缺但后续有完整项 | 聊天选择只派生 `completeProviders`                                              |
| Wizard 保存规则与聊天可用规则混淆  | 同一模型合法性函数；保留 Wizard 的“全部模型合法”保存规则                        |
| Portal 定位在面板 resize 后漂移    | 打开期间监听 resize 与 capture scroll 重新定位                                  |
| 自动引导与设置面板重叠             | 两种 overlay 互斥                                                               |
| 原生 select 测试失效               | 改为角色和键盘交互测试                                                          |
| 无上下文文档                       | 本次以 PRD、ADR 和现有源码为依据；建议后续 `/setup` 或架构治理补充 `CONTEXT.md` |

## 12. 实施拆分建议

```text
T1 Provider 完整性、Wizard 初始步骤、i18n
  └─> T3 App 引导、CTA、保存后选中、集成测试

T2 共享容器、ChatSelect、MessageInput 和组件测试
```

T1 与 T2 可并行；T3 依赖 T1。总计预计 10 个生产文件和 5 至 6 个测试文件，符合一个相互关联的 UI 功能集。

## 13. 非方案内容

严格遵循 [Out of Scope](../out-of-scope.md)：不全局替换设置控件、不重做首页视觉、不增加 Provider 连通性检查、不引导其他设置项、不增加埋点。
