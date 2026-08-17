/** 功能开关 */
export const FEATURE_FLAGS = {
  /** AI SDK prepareStep + pruneMessages 上下文管理 */
  usePrepareStepContext: true,
  /** Guardrail riskLevel → toolApproval 映射 */
  useToolApproval: true,
  /** 工具懒加载：LLM 预分类 + activeTools 过滤 */
  useToolLazyLoad: true,
};
