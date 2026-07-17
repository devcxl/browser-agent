/** 功能开关，控制是否使用 AI SDK ToolLoopAgent 替代旧 AgentLoop */
export const FEATURE_FLAGS = {
  useToolLoopAgent: false,
  /** 是否在 ToolLoopAgent.prepareStep 中使用 ContextManager 管理上下文窗口 */
  usePrepareStepContext: true,
  /** 是否使用 Guardrail riskLevel → toolApproval 映射，替代旧 confirmation 流程 */
  useToolApproval: false,
};
