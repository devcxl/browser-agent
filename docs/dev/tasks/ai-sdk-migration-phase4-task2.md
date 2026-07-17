---
parent_issue: 135
phase: 4
dependencies: ["Phase 4.1"]
status: todo
estimated_lines: +50/-200
---

# Task 4.2: 迁移聊天组件到 AI SDK message.parts 模型

## 目标
适配 `MarkdownViewer` 和 `ToolCallBubble` 组件，支持 AI SDK 的 `UIMessage.parts[]` 消息类型。

## 实现要点
1. AI SDK UIMessage 通过 `parts[]` 表达消息内容：
   - `{ type: 'text', text }` → `MarkdownViewer`
   - `{ type: 'tool-call', toolCallId, toolName, args }` → `ToolCallBubble`
   - `{ type: 'tool-result', toolCallId, toolName, result }` → 工具结果展示
   - `{ type: 'reasoning', text }` → 思考过程折叠展示

2. `MarkdownViewer` 适配：
   - 接收 `UIMessage` 类型（而非自定义 `ChatMessage`）
   - 遍历 `parts[]` 渲染不同内容

3. `ToolCallBubble` 适配：
   - 从 `parts[]` 中提取 `tool-call` 类型
   - 显示 `toolCallId`、`toolName`、`args`、`state`
   - 工具执行状态通过 `tool-call` 的 `state` 字段获取

4. 新增推理过程展示（`reasoning` part）

## 验收标准
- [ ] MarkdownViewer 正确渲染 text parts
- [ ] ToolCallBubble 正确显示工具调用和结果
- [ ] reasoning parts 可折叠展示
- [ ] 消息列表滚动和自动跟随正常
- [ ] UI 与迁移前视觉一致
