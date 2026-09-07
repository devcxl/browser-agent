# 变异测试（Mutation Testing）验证报告

日期：2026-09
工具：Stryker 10 + vitest-runner（jsdom 环境）
配置：`stryker.conf.json`

## 目的

行覆盖率 99.87% 只说明"代码被执行过"，不代表"测试能察觉行为变化"。本报告用变异测试（逐句篡改源码、验证测试能否发现）校验测试套件的**有效性**，并对发现的真盲区补充测试。

## 总体结论

- 变异测试有效揭示了 **行覆盖为 100% 的模块中仍存在测试断言盲区**（audio-utils 由全零样本导致的 24% 变异得分是典型案例）。
- 已针对真盲区补充测试，并用 stryker 复跑确认击杀率提升（见下表）。
- 剩余存活 mutants 绝大多数为**等效变异**：console 日志文案、防御性清理（`clearTimeout` 幂等）、`if(this.port)` 安全守卫、`?? undefined` 空值展开等。此类变异不改变可观测业务行为，刻意"击杀"反而会写出与实现绑死的脆弱测试，不予处理。

## 各模块变异得分（修复后）

| 模块 | 变异得分 | 提升 | 说明 |
|------|---------|------|------|
| jsonrpc/router.ts | 100% | - | |
| registry/tool-registry.ts | 100% | - | |
| shared/permissions.ts | 100% | - | |
| shared/token-estimate.ts | 100% | - | |
| agent/conversation-compaction.ts | 94.2% | 53.6→94.2 | cutoff 边界、formatMessage 格式 |
| provider/llm-client.ts | 93.3% | 80→93.3 | 新增：underlying/initPromise 缓存复用、并发去重、modelId 透传 |
| provider/audio-utils.ts | 91.9% | 24→91.9 | 新增独立测试：WAV 字节级断言、端序、正负边界裁剪 |
| shared/i18n.ts | 83.3% | - | 剩余为 console/正则等效 |
| provider/stt-client.ts | 88% | 76→88 | 尾斜杠、无 api fallback、Authorization、错误体回退 |
| shared/jsonrpc/client.ts | 89.6% | 81→89.6 | dispatch 不派发非法消息、listener 移除、cleanup 断言 |
| agent/context-builder.ts | 70.7% | - | 大量等效边界 |
| conversation/conversation-manager.ts | 71.1% | 62→71 | putConversation 参数断言、normalizeTitle 格式矩阵、needsSummary 阈值边界、toolCalls assistant 跳过标题 |
| agent/tool-loop-adapter.ts | 66.7% | - | 818 行大文件，剩余多为 console/防御性兜底 |
| agent/tool-classifier.ts | 68.3% | - | 见下方"stryker 失真说明" |

## 修复的真实盲区（均为手动 mutant 验证可击杀）

1. **audio-utils**：原测试经 stt 间接覆盖，样本全零 → 裁剪/端序/负数分支全部变异存活。新增 9 用例做 WAV 产物字节级断言。
2. **jsonrpc/client**：非法消息"不派发 handler"、disconnect/cleanup 后 listener 是否真的移除（spy 断言）、connect 失败后 `connected===false`。
3. **conversation-compaction**：`startIndex` 恰为 user 索引、无任何 cutoff 落入预算时回退 latestCutoff、中间 user 满足预算、break 保护保留轮。
4. **conversation-manager**：`putConversation` 参数级断言（titleGenerated/sensitiveDataGranted）；normalizeTitle 的 12 组格式输入；`needsSummary` 恰好命中阈值边界；仅 toolCalls 的 assistant 不得触发标题生成。
5. **llm-client**：底层 client 缓存与并发去重（createClient 仅调用 1 次）。

## stryker 失真说明

`agent/tool-classifier.ts` 的 stryker 报告不可靠：将 `if (a && b && c)` 变异为 `if (a || b && c)` 后手动修改源码跑单测**必然失败**，但 stryker 报告 survived（130 mutants 全 survive 的极端情形也曾出现）。已排除 vitest cache、runner 复用等因素。该文件补的测试均已通过"手动修改源码 + 单测失败"方式验证有效，不采信 stryker 的存活报告。

## 不可测死代码（覆盖率剩余）

- `src/test-setup.ts:1` setup 文件 import 行
- `src/content/markdown-converter.ts:50-54` preCodeBlock 规则 filter（Readability 会剥掉 pre 的 class，输入不可达）
- `src/content/floating-widget/widget.ts:479-481` menuHideTimer 从未被赋非 null

## 复跑方式

```bash
# 全部文件变异（很慢，仅建议 CI 之外的抽查）
npx stryker run stryker.conf.json

# 单模块抽查
npx stryker run stryker.conf.json --mutate 'src/agent/conversation-compaction.ts'
```
