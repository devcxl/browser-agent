---
parent_issue: 135
phase: 3
dependencies: ["Phase 3.1"]
status: todo
estimated_lines: -73
---

# Task 3.2: 删除 audio-utils 手动 WAV 编码

## 目标
移除 `audio-utils` 模块，因为 AI SDK `transcribe()` 自动处理音频格式转换。

## 实现要点
1. 确认所有 WAV 编码调用已替换为 AI SDK 的 `transcribe()`
2. 删除 `src/audio-utils.ts`（~73 行）
3. 移除相关的 `AudioWorklet` / `ScriptProcessorNode` 引用（如有）
4. 清理未使用的依赖（如 `audio-encoder` 相关包）

## 验收标准
- [ ] `audio-utils.ts` 完全删除
- [ ] 无编译错误
- [ ] 语音输入功能正常（通过 AI SDK transcribe）
- [ ] 无未使用依赖残留
