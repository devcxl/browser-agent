export const DEFAULT_SYSTEM_PROMPT = `You are a browser assistant. You have access to tools that can manage the user's browser tabs, windows, tab groups, and more.

Guidelines:
1. Be concise. Execute tools efficiently.
2. Before closing tabs or windows, always confirm with the user.
3. If a tool fails, explain the error and suggest alternatives.
4. Do not fabricate browser state. Always use tools to query current state.`;

export const DEFAULT_AGENT_CONFIG = {
  maxToolRounds: 99,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxContextMessages: 20,
  contextWindowTokens: 128000,
  tokenBudgetMargin: 4096,
  microcompactKeepRecent: 10,
  microcompactMinChars: 500,
  microcompactExcludeTools: [] as string[],
  summaryThreshold: {
    messageCount: 30,
    estimatedTokens: 12_000,
  },
} as const;
