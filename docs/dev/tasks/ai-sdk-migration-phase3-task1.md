---
parent_issue: 135
phase: 3
dependencies: ["Phase 1.3"]
status: todo
estimated_lines: +15/-185
---

# Task 3.1: 替换 stt-client 为 transcribe()

## 目标
用 AI SDK v7 的 `transcribe()` 函数替换自研 `SttClient`，消除手动 fetch 调用和格式处理。

## 实现要点
1. 修改 `useVoiceInput` hook 或语音输入模块：
   ```typescript
   // 迁移前:
   const client = new SttClient(providerConfig);
   const text = await client.transcribe(audioBlob);
   
   // 迁移后:
   import { transcribe } from 'ai';
   const provider = createOpenAI({ apiKey, baseURL });
   const result = await transcribe({
     model: provider.transcription(modelName),
     audio: audioBlob,
   });
   const text = result.text;
   ```
2. `ProviderConfig.sttModel` 和 `ProviderConfig.audioFormat` 字段保留
3. `useVoiceInput` hook 接口不变：仍返回 `(audioBlob) => Promise<string>`
4. 通过 Feature Flag `useSDKTranscribe` 控制新旧切换

## 验收标准
- [ ] 语音输入 → 转录 → 发送消息 完整流程
- [ ] 支持 OpenAI / Anthropic / Google 转录 Provider
- [ ] Feature Flag 关闭时仍使用旧 SttClient
- [ ] 单元测试：transcribe 调用正确，错误处理正常
- [ ] E2E 测试：语音输入完整流程
