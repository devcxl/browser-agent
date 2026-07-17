/** 功能开关 — 全部已切换至 AI SDK 原生路径 */
export const FEATURE_FLAGS = {
  /** AI SDK ToolLoopAgent 替代旧 AgentLoop */
  useToolLoopAgent: true,
  /** AI SDK prepareStep (ContextManager) 上下文管理 */
  usePrepareStepContext: true,
  /** Guardrail riskLevel → toolApproval 映射 */
  useToolApproval: true,
  /** AI SDK useChat + DirectChatTransport */
  useSDKChat: true,
};
