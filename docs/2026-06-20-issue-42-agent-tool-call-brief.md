## Agent Brief

**类别：** bug
**摘要：** 将 `useAgent` Chat UI hook 从自实现流式调用改为委托给 `AgentLoop`，使 Agent 能正确调用工具。

**当前行为：**
`useAgent.run()` 自己调用 `LlmClient.chatStream()`，不传 `tools` 参数，不处理 `tool_calls` delta。LLM 只返回纯文本，无法执行任何工具。

**期望行为：**
`useAgent.run()` 委托给 `AgentLoop.run()` 执行完整 Agent 循环，LLM 能发起 `tool_calls`，工具结果返回给 LLM 继续推理，UI 实时展示工具调用卡片和最终回复。

**关键接口：**
- `useAgent.run()` — 替换内部实现，从自实现流式改为调用 `AgentLoop.run()`
- `AgentLoop` — 需增加 `onToolCall` / `onStreamChunk` 回调以支持 UI 实时更新
- `ToolCallRecord` → `ToolCallDisplay` — 需要转换函数将 Agent 层的工具记录映射为 UI 层展示类型
- `useAgent` — 需要接收真实的 `ToolRegistry`、`Guardrail`、`ConversationManager` 依赖（当前为硬编码 mock）

**验收标准：**
- [ ] 修复前能复现 bug：Chat UI 发送"列出所有标签页"，LLM 只返回文本
- [ ] 修复后 Agent 能正确调用工具：同样消息触发 `tool_calls`，执行 `list_tabs` 并返回结果
- [ ] UI 展示 ToolCallCard：工具调用在消息气泡中以可展开卡片形式呈现
- [ ] 多轮工具调用正常：Agent 能在一次对话中连续调用多个工具
- [ ] 相关测试全部通过：`agent-loop.test.ts` 和新增的 useAgent 集成测试
- [ ] 无回归：停止按钮、错误处理、确认对话框等现有功能不受影响

**不在范围内：**
- 不修改 AgentLoop 的核心工具调用逻辑（它本身是正确的）
- 不修改 Guardrail、ToolRegistry 等底层模块
- 不涉及 Expert Mode 或 Provider 配置变更
