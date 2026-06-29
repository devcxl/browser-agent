# 开发文档: T9 - SettingsPanel 国际化 + 语言选择器

**Project:** i18n-国际化支持
**Task ID:** T9
**Slug:** i18n-settings-panel
**Issue:** #115
**类型:** frontend
**Batch:** 3
**依赖:** T3 (I18nProvider + useI18n)

## 1. 目标

将 `SettingsPanel` 组件中全部硬编码文本替换为 `t()` 调用，并在 Provider Tab 下方新增语言选择下拉框（中/英切换），切换后通过 `setLanguage()` 即时生效。

## 2. 前置条件

- [ ] T3 完成 — `useI18n` hook 可用，返回 `{ t, locale, setLanguage }`
- [ ] T1 完成 — 语言包中 `settings.*`、`common.*` 全部 key 已定义

## 3. 实现步骤

### 3.1 增加导入和 hook 调用

**文件：** `src/entrypoints/sidepanel/components/SettingsPanel.tsx`

增加导入：
```typescript
import { useI18n } from '../i18n/useI18n';
```

在 `SettingsPanel` 函数体顶部增加：
```typescript
const { t, locale, setLanguage } = useI18n();
```

### 3.2 语言选择器组件（新增）

在设置面板的 Tab 栏下方、内容区上方插入语言选择区域。

**位置：** 在 Tab 按钮行（第 224-241 行）之后、内容区（第 243 行 `<div className="flex-1...">`）之前。

```tsx
{/* 语言选择器 */}
<div className="px-5 py-2 border-b border-hairline bg-surface-soft">
  <label className="flex items-center gap-2 text-sm">
    <span className="text-mute">{t('settings.language')}</span>
    <select
      value={locale}
      onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en')}
      className="px-2 py-1 text-sm border border-hairline rounded-md bg-canvas text-ink focus:outline-none focus:border-primary"
    >
      <option value="zh-CN">中文</option>
      <option value="en">English</option>
    </select>
  </label>
</div>
```

**注意：** 语言选项名称"中文"/"English"本身不翻译——用户需要用母语识别自己的语言。这是 i18n 领域的标准做法。

### 3.3 需要新增的语言包 Key

当前技术方案的 `MessageSchema` 中缺少 `settings.language`，需要在 T1 语言包中补充：
```json
{
  "settings": {
    "language": "语言 / Language"
  }
}
```
中文：`语言`，英文：`Language`

并在 `i18n/types.ts` 的 `MessageSchema.settings` 接口中补充 `language: string;`。

### 3.4 替换清单

#### 3.4.1 标题和 Tab 标签

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 214 | `设置` | `{t('settings.title')}` | `settings.title` |
| 238 | `'Provider'` | `{t('settings.tabs.provider')}` | `settings.tabs.provider` |
| 238 | `'Agent'` | `{t('settings.tabs.agent')}` | `settings.tabs.agent` |
| 238 | `'Expert Mode'` | `{t('settings.tabs.expert')}` | `settings.tabs.expert` |
| 238 | `'Skills'` | `{t('settings.tabs.skills')}` | `settings.tabs.skills` |

#### 3.4.2 Provider Tab

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 247 | `暂无 Provider 配置` | `{t('settings.provider.noProviders')}` | `settings.provider.noProviders` |
| 259 | `Trusted` | `{t('settings.provider.trusted')}` | `settings.provider.trusted` |
| 267 | `🎤 语音模型:` (前缀) | `🎤 {t('settings.provider.voiceModel')}:` | `settings.provider.voiceModel` |
| 267 | `\| 输出:` | `\| {t('sidebar.output')}:` | 复用 `sidebar.output` |
| 278 | `测试中...` | `{t('settings.provider.testing')}` | `settings.provider.testing` |
| 278 | `测试` | `{t('settings.provider.test')}` | `settings.provider.test` |
| 301 | `编辑` | `{t('settings.provider.edit')}` | `settings.provider.edit` |
| 307 | `删除` | `{t('settings.provider.delete')}` | `settings.provider.delete` |
| 318 | `placeholder="名称"` | `placeholder={t('settings.provider.placeholder.name')}` | `settings.provider.placeholder.name` |
| 324 | `placeholder="Endpoint (...)"` | `placeholder={t('settings.provider.placeholder.endpoint')}` | `settings.provider.placeholder.endpoint` |
| 333 | `placeholder="API Key"` | `placeholder={t('settings.provider.placeholder.apiKey')}` | `settings.provider.placeholder.apiKey` |
| 339 | `placeholder="模型 (...)"` | `placeholder={t('settings.provider.placeholder.model')}` | `settings.provider.placeholder.model` |
| 347 | `placeholder="语音模型 (...)"` | `placeholder={t('settings.provider.placeholder.sttModel')}` | `settings.provider.placeholder.sttModel` |
| 362 | `录音后统一转为指定格式再发送，留空则自动转 WAV` | `{t('settings.provider.audioFormatHint')}` | `settings.provider.audioFormatHint` |
| 369 | `Local Trusted Provider（标记为本地可信，可发送敏感数据）` | `{t('settings.provider.trustedLabel')}` | `settings.provider.trustedLabel` |
| 379 | `保存` | `{t('settings.provider.save')}` | `settings.provider.save` |
| 386 | `取消` | `{t('settings.provider.cancel')}` | `settings.provider.cancel` |
| 399 | `+ 添加 Provider` | `+ {t('settings.provider.add')}` | `settings.provider.add` |

#### 3.4.3 音频格式下拉选项

`AUDIO_FORMATS` 数组（第 35-44 行）中的 `label` 也需要国际化。当前方案中 `settings.provider.audioFormats` 是一个 `Record<string, string>`，key 为 MIME type value。

改造方式：将 `AUDIO_FORMATS` 改为使用 `t()` 动态获取 label：

```typescript
const AUDIO_FORMATS = useMemo(() => [
  { value: '', label: t('settings.provider.audioFormats.wavAuto') },
  { value: 'audio/webm;codecs=opus', label: t('settings.provider.audioFormats.webmOpus') },
  { value: 'audio/webm', label: t('settings.provider.audioFormats.webm') },
  { value: 'audio/mp4;codecs=mp4a.40.5', label: t('settings.provider.audioFormats.mp4Aac') },
  { value: 'audio/mp4', label: t('settings.provider.audioFormats.mp4') },
  { value: 'audio/aac', label: t('settings.provider.audioFormats.aac') },
  { value: 'audio/ogg;codecs=opus', label: t('settings.provider.audioFormats.oggOpus') },
  { value: 'audio/wav', label: t('settings.provider.audioFormats.wav') },
], [t]);
```

对应语言包 key（`settings.provider.audioFormats.*`）：
- `wavAuto`: 自动（推荐）— 统一转为 WAV 发送 / Auto (recommended) — Convert to WAV
- `webmOpus`: WebM Opus
- `webm`: WebM
- `mp4Aac`: MP4 AAC
- `mp4`: MP4
- `aac`: AAC
- `oggOpus`: OGG Opus
- `wav`: WAV

#### 3.4.4 Agent Tab

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 408 | `最大工具调用轮次` | `{t('settings.agent.maxToolRounds')}` | `settings.agent.maxToolRounds` |
| 421 | `上下文最大消息数` | `{t('settings.agent.maxContextMessages')}` | `settings.agent.maxContextMessages` |
| 434 | `思考强度` | `{t('settings.agent.reasoningEffort')}` | `settings.agent.reasoningEffort` |
| 442 | `Low（低）` | `{t('settings.agent.reasoningOptions.low')}` | `settings.agent.reasoningOptions.low` |
| 443 | `Medium（中）` | `{t('settings.agent.reasoningOptions.medium')}` | `settings.agent.reasoningOptions.medium` |
| 444 | `High（高）` | `{t('settings.agent.reasoningOptions.high')}` | `settings.agent.reasoningOptions.high` |
| 445 | `Max（最大）` | `{t('settings.agent.reasoningOptions.max')}` | `settings.agent.reasoningOptions.max` |
| 448 | `控制 LLM 推理深度...` | `{t('settings.agent.reasoningEffortHint')}` | `settings.agent.reasoningEffortHint` |
| 452 | `系统提示词` | `{t('settings.agent.systemPrompt')}` | `settings.agent.systemPrompt` |

#### 3.4.5 Expert Mode Tab

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 476 | `Expert Mode` | `{t('settings.expert.title')}` | `settings.expert.title` |
| 480 | `子开关配置（功能灰度控制）` | `{t('settings.expert.subSwitchHint')}` | `settings.expert.subSwitchHint` |
| 507 | `+ 添加子开关` | `{t('settings.expert.addSwitch')}` | `settings.expert.addSwitch` |

#### 3.4.6 Skills Tab

| 行号 | 原文本 | 替换后 | Key |
|------|--------|--------|-----|
| 521 | `placeholder="输入 GitHub 仓库，如 owner/repo"` | `placeholder={t('settings.skills.placeholder')}` | `settings.skills.placeholder` |
| 530 | `添加` | `{t('settings.skills.add')}` | `settings.skills.add` |
| 540 | `隐藏 Token` / `配置 GitHub Token（选填，提高 API 限流）` | 见 3.5 | `settings.skills.hideToken` / `settings.skills.configToken` |
| 548 | `placeholder="ghp_xxx 或 github_pat_xxx"` | `placeholder={t('settings.skills.tokenPlaceholder')}` | `settings.skills.tokenPlaceholder` |
| 566 | `暂无订阅和技能，输入 GitHub 仓库地址添加` | `{t('settings.skills.noSubscriptions')}` | `settings.skills.noSubscriptions` |
| 582 | `{subSkills.length} 个技能` | `{t('settings.skills.skillsCount', { count: subSkills.length })}` | `settings.skills.skillsCount` |
| 591 | `同步中...` | `{t('settings.skills.syncing')}` | `settings.skills.syncing` |
| 591 | `同步` | `{t('settings.skills.sync')}` | `settings.skills.sync` |
| 598 | `删除` | `{t('settings.skills.delete')}` | `settings.skills.delete` |
| 649 | `本地技能` | `{t('settings.skills.localSkills')}` | `settings.skills.localSkills` |
| 657 | `启用` | `{t('settings.skills.enabled')}` | `settings.skills.enabled` |
| 146 | msg (sync ok) `同步完成，共 ${parsed.length} 个技能` | `{t('settings.skills.syncComplete', { count: parsed.length })}` | `settings.skills.syncComplete` |
| 148 | msg (sync err) `同步失败: ${...}` | `{t('settings.skills.syncFailed')}: ${(err as Error).message}` | `settings.skills.syncFailed` |
| 160 | msg (exists) `该订阅已存在` | `{t('settings.skills.subscriptionExists')}` | `settings.skills.subscriptionExists` |

### 3.5 Token 按钮条件文本

第 539-541 行的 Token 按钮文本是条件显示：
```tsx
// 改前
{showToken ? '隐藏 Token' : '配置 GitHub Token（选填，提高 API 限流）'}

// 改后
{showToken ? t('settings.skills.hideToken') : t('settings.skills.configToken')}
```

### 3.6 模板变量使用示例

Skills 同步完成消息使用模板变量：
```typescript
// 改前 (第 146 行)
msg: `同步完成，共 ${parsed.length} 个技能`

// 改后
msg: t('settings.skills.syncComplete', { count: parsed.length })
```

语言包中：
- 中文：`同步完成，共 {{count}} 个技能`
- 英文：`Sync complete, {{count}} skills`

同理 `skillsCount`：
- 中文：`{{count}} 个技能`
- 英文：`{{count}} skills`

### 3.7 日期格式化（Skills tab 中的 `lastSyncedAt`）

第 579 行：
```tsx
// 改前
{new Date(sub.lastSyncedAt).toLocaleString('zh-CN')}

// 改后
{new Date(sub.lastSyncedAt).toLocaleString(locale)}
```

### 3.8 测试结果图标保留

`✓` 和 `✕` 是符号（非文本），不需要国际化。

## 4. 接口/契约

### 4.1 语言选择器接口

```typescript
// useI18n() 返回的 setLanguage
setLanguage: (lang: 'zh-CN' | 'en') => Promise<void>;
```

`setLanguage` 内部流程（T3 实现）：
1. 更新 I18nProvider 内部 state
2. 调用 `ConfigStore.set('preferences', { language })` 持久化
3. 通过 chrome.storage.onChanged 跨标签页同步

### 4.2 使用的语言包 Key 汇总

- `settings.title`, `settings.language`
- `settings.tabs.provider`, `settings.tabs.agent`, `settings.tabs.expert`, `settings.tabs.skills`
- `settings.provider.*`（约 20 个 key）
- `settings.provider.audioFormats.*`（8 个 key）
- `settings.provider.placeholder.*`（5 个 key）
- `settings.agent.*`（约 8 个 key）
- `settings.agent.reasoningOptions.*`（4 个 key）
- `settings.expert.*`（3 个 key）
- `settings.skills.*`（约 16 个 key）
- `sidebar.output`（复用）
- `common.*`（复用 `common.cancel`、`common.save`、`common.delete`、`common.edit`、`common.add`）

### 4.3 需要在 T1 语言包中新增的 Key

| Key | 中文 | 英文 |
|-----|------|------|
| `settings.language` | 语言 | Language |

该 key 在现有 MessageSchema 中缺失。

## 5. 测试指引

### 5.1 现有测试

`src/entrypoints/sidepanel/__tests__/SettingsPanel.test.tsx`

需更新：
- Mock `useI18n` 返回 `{ t: (key) => key, locale: 'zh-CN', setLanguage: vi.fn() }`
- 验证所有文本使用 `t()` 调用
- 验证语言选择器 onChange 触发 `setLanguage`
- 验证模板变量替换正确（如 skills count）

### 5.2 手动验证

1. 打开设置面板 → 所有标签、按钮、提示文本为中文
2. 在语言选择器中切换到 English → 所有文本立即切换为英文
3. 刷新 sidepanel → 语言保持为上次选择的 English
4. 音频格式下拉选项文本跟随语言切换
5. Skills tab 的模板变量 "5 个技能" / "5 skills" 正确
6. 同步消息 "同步完成，共 3 个技能" / "Sync complete, 3 skills" 正确

## 6. 验收标准

- [ ] "设置"标题可切换
- [ ] 4 个 Tab 标签（Provider/Agent/Expert Mode/Skills）可切换
- [ ] Provider Tab：所有表单标签、placeholder、按钮、提示文本可切换
- [ ] Provider Tab：音频格式下拉选项文本跟随语言
- [ ] Agent Tab：所有标签、选项、提示文本可切换
- [ ] Expert Mode Tab：标题和提示文本可切换
- [ ] Skills Tab：所有按钮、placeholder、提示、状态消息可切换
- [ ] Skills Tab：模板变量消息正确替换
- [ ] 新增语言选择器：切换到英文后全设置面板即时更新
- [ ] 语言切换持久化（刷新后保持）
- [ ] `npx tsc --noEmit` 零错误
- [ ] 现有测试全部通过

## 7. 注意事项

### 7.1 语言选项名称不翻译

下拉框中的 `中文` 和 `English` 不应翻译——用户需要用母语找到自己的语言。这是 i18n 标准实践（类似 iOS 设置中语言列表用各自语言显示）。

### 7.2 `AUDIO_FORMATS` 从常量变为动态

将 `AUDIO_FORMATS` 从组件外常量移入组件内或使用 `useMemo` 包裹，因为其 label 依赖 `t()`。需要相应调整代码结构。

或者保持常量结构不变，改为在使用时翻译：
```tsx
{AUDIO_FORMATS.map((fmt) => (
  <option key={fmt.value} value={fmt.value}>
    {t(fmt.labelKey)}
  </option>
))}
```
其中 `AUDIO_FORMATS` 改为：
```typescript
const AUDIO_FORMATS = [
  { value: '', labelKey: 'settings.provider.audioFormats.wavAuto' },
  // ...
];
```

推荐后者，更简洁。

### 7.3 设置面板文本量最大

这是本次 i18n 改造中改动量最大的单个文件（约 50+ 处文本替换），建议优先确保语言包所有 key 已就绪后再开始改造。

### 7.4 与 SkillPanel 的代码重叠

`SettingsPanel` 的 Skills Tab（第 514-697 行）和独立的 `SkillPanel` 组件（`SkillPanel.tsx`）有大量重叠代码。T11 会改造 `SkillPanel`，两处需保持一致。重构合并代码不在本任务范围内，但改造时需确保两处使用相同的 key。
