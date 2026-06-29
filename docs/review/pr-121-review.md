## 审查报告 — PR #121: T2 实现首次语言检测逻辑

### 变更概述
- **分支**: `feat/implement-language-detector` → `dev`
- **Issue**: #109
- **修改文件数**: 2（全部新增）
- **新增文件**:
  - `src/entrypoints/sidepanel/i18n/language-detector.ts` — 语言检测实现
  - `src/entrypoints/sidepanel/__tests__/language-detector.test.ts` — 单元测试
- **风险等级**: 低 — 无 Critical/High 问题，仅 Medium 建议

### 自动化验证结果

| 检查项 | 结果 |
|--------|------|
| 全部测试通过（74 文件 / 781 用例） | ✅ 通过 |
| 语言检测逻辑：zh → zh-CN, en → en, 其他 → zh-CN | ✅ 正确 |
| raw storage 检查避免默认值干扰 | ✅ 正确 |
| 有偏好时跳过不覆盖 | ✅ 正确 |

---

### 审查要点逐项分析

#### 1. `detectLanguage()` 是否正确处理 zh/en/其它 fallback

```typescript
export function detectLanguage(): 'zh-CN' | 'en' {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('en')) return 'en';
  return 'zh-CN';
}
```

- `toLowerCase()` + `startsWith` 策略正确处理大小写变体（如 `zh-cn`、`EN-US`）
- `zh-TW` 映射到 `zh-CN`（繁体中文 → 简体中文 UI）—— 这是有意的设计决策，接受标准中已明确
- 所有非 zh/en 语言 fallback 到 `zh-CN`，逻辑完备

**结论**: ✅ 通过

#### 2. `detectAndSetLanguage()` 是否使用 raw storage 避免默认值干扰

```typescript
export async function detectAndSetLanguage(): Promise<void> {
  const raw = await browser.storage.local.get('preferences');
  if (raw.preferences?.language) return;
  ...
}
```

- `browser.storage.local.get('preferences')` 绕过 ConfigStore 的默认值合并（默认值 `language: 'zh-CN'` 为 truthy，会误跳过检测）
- `raw.preferences?.language` 在 key 不存在时返回 `undefined`（falsy），正确触发检测
- `raw.preferences?.language` 在 language 为空字符串 `''` 时也是 falsy，正确触发检测
- 随后通过 `store.get('preferences')` 获取完整默认值合并后的偏好对象，仅覆盖 language 字段
- 读-改-写模式保留了所有其他偏好设置

**结论**: ✅ 通过

#### 3. 测试覆盖是否完整

| 场景 | 覆盖 |
|------|------|
| zh / zh-CN / zh-Hans / zh-TW / zh-cn → zh-CN | ✅ |
| en / en-US / en-GB → en | ✅ |
| fr / de / ja → zh-CN (fallback) | ✅ |
| 无偏好时写入检测结果 | ✅ |
| 已有偏好时跳过 | ✅ |
| zh-TW 检测为 zh-CN | ✅ |
| 不支持语言 fallback 到 zh-CN | ✅ |

**结论**: 基本覆盖完整，有一个小边界场景缺失（见下方 Medium #2）

---

### 发现问题

#### [MEDIUM] #1: `mockBrowserStorage` 函数重复定义

- **文件**: `src/entrypoints/sidepanel/__tests__/language-detector.test.ts:10-50`
- **问题**: `mockBrowserStorage` 与 `src/shared/storage/__tests__/config-store.test.ts` 中的实现完全相同（40 行代码完全重复）。未来如需修改 mock 行为，需要同时改两处。
- **修复建议**: 将 `mockBrowserStorage` 抽取到 `src/__tests__/mocks/storage-mock.ts`，两个测试文件共享同一实现。

```typescript
// src/__tests__/mocks/storage-mock.ts
// 从 config-store.test.ts 复制并 export
export function mockBrowserStorage() { ... }
```

- **优先级**: Medium — 不影响功能，但增加维护负担。

#### [MEDIUM] #2: 缺少 `preferences` key 不存在的边界测试

- **文件**: `src/entrypoints/sidepanel/__tests__/language-detector.test.ts`
- **问题**: 所有 `detectAndSetLanguage` 测试都手动设置了 `browserMock.storage['preferences'] = {...}`，缺少 `preferences` key 完全不存在的场景（首次安装，storage 为空）。虽然代码逻辑能正确处理（`raw.preferences?.language` → `undefined` → 触发检测），但没有测试证明。
- **修复建议**: 添加测试用例：

```typescript
it('should detect language when preferences key does not exist in storage', async () => {
  // 不设置任何 preferences —— 模拟首次安装
  await withNavigatorLanguage('en-US', async () => {
    await detectAndSetLanguage();
    expect(browserMock.mock.set).toHaveBeenCalledWith({
      preferences: expect.objectContaining({ language: 'en' }),
    });
  });
});
```

- **优先级**: Medium — 边界行为缺少显式测试，但逻辑本身正确。

#### [MEDIUM] #3: `detectAndSetLanguage` 缺少错误处理

- **文件**: `src/entrypoints/sidepanel/i18n/language-detector.ts:19-27`
- **问题**: 如果 `browser.storage.local.get` 或 `store.set` 因为 storage 异常（如 extension context invalidated）抛出错误，该未处理异常会传播到调用方（通常是初始化路径），可能导致初始化崩溃。
- **修复建议**: 该函数作为初始化辅助函数，应在失败时静默降级，不阻断启动流程。

```typescript
export async function detectAndSetLanguage(): Promise<void> {
  try {
    const raw = await browser.storage.local.get('preferences');
    if (raw.preferences?.language) return;

    const store = ConfigStore.getInstance();
    const language = detectLanguage();
    const prefs = await store.get('preferences');
    await store.set('preferences', { ...prefs, language });
  } catch {
    // 首次语言检测失败不阻断启动流程，使用默认值即可
  }
}
```

- **优先级**: Medium — 在正常运行环境下不会触发，但增加了健壮性。仅当调用方有 try/catch 保护时可忽略。

#### [LOW] #1: 测试中断言风格不一致

- **文件**: `src/entrypoints/sidepanel/__tests__/language-detector.test.ts:140` vs `:156`
- **问题**: 第 140 行使用全量 `toHaveBeenCalledWith({...})`，第 156/170 行使用 `expect.objectContaining({...})`。两种用法都正确，但风格不一致可能暗示意图不同（后者只关心 language，前者关心完整对象）。
- **建议**: 统一使用 `expect.objectContaining`（更灵活的意图表达），或两者都保持不变（均有合理理由）。

---

### 测试建议

不需要补充额外测试用例。现有 15 个测试用例覆盖了核心路径、边界值和 fallback 逻辑。

如果 #2 的 Medium 建议被采纳，增加 1 个 `preferences` key 不存在的测试用例即可。

---

### 审查结论

- [x] **有条件通过** — 仅 Medium 及以下问题，可在后续迭代中修复

**建议**: Approve，Medium 问题不阻塞合并。推荐优先处理 #1（去重 mock）和 #3（错误处理），可选处理 #2（补充边界测试）。
