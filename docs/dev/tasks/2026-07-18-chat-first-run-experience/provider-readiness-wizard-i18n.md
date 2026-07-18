---
name: 'provider-readiness-wizard-i18n'
github_issue: 163
depends_on: []
labels: ['task']
worktree_root: '.worktree/provider-readiness-wizard-i18n/'
---

# Provider 就绪度、Wizard 初始步骤与国际化

## 目标

提取 Provider/模型就绪度纯函数，使 `ProviderWizard` 与聊天页共享一致的校验语义；为引导入口提供初始步骤和完整中英文文案。

## 实现要点

1. 新增 `src/entrypoints/sidepanel/provider-readiness.ts`，导出模型校验与 Provider 就绪度函数。
2. 就绪条件为非空 `api` 或 `endpoint` 加至少一个合法模型；API Key、Provider 名称和 `isLocalTrusted` 不是条件。
3. 端点缺失优先返回 `connection`，否则模型无效返回 `models`。
4. `ProviderWizard` 接受可选 `initialStep`，未传时保持现有编辑入口行为；保存仍要求所有已填写模型合法。
5. 扩展 i18n schema、`zh-CN.json` 与 `en.json`，并让 `ProviderWizard` 使用 `useI18n()`。
6. 为就绪度边界、`initialStep`、默认行为与中英文切换补齐单元/组件测试。

## 验收标准

- [ ] `api` 或 `endpoint` 有效、至少一个合法模型且无 API Key 时判定为完整。
- [ ] 空模型、非法模型和缺失端点均判定为不完整，且返回正确的引导步骤。
- [ ] 设置面板既有 Wizard 入口不传 `initialStep` 时仍从原有默认步骤开始。
- [ ] Wizard 与新增引导文案随语言切换同步显示。
- [ ] 定向测试、`npm run typecheck` 与 `npm run lint` 通过。

## Worktree

- 路径: `.worktree/provider-readiness-wizard-i18n/`
- 分支: `feat/provider-readiness-wizard-i18n`
- 创建时机: `/code` 阶段首次执行时自动创建
- 清理时机: PR 合并后自动删除
