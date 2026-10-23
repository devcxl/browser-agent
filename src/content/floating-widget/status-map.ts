/**
 * agent 状态 → GrokBot 状态映射（纯函数）。
 *
 * sidepanel 通过 postMessage 上报 agent 的原始状态；头像引擎只认识自己的
 * GrokBotState 词表，两者之间的翻译集中在这里，避免字符串散落导致漂移。
 */

import type { GrokBotState } from './grokbot';

const STATUS_TO_BOT_STATE: ReadonlyMap<string, GrokBotState> = new Map([
  ['idle', 'idle'],
  ['running', 'working'],
  ['streaming', 'thinking'],
  ['waitingConfirmation', 'listening'],
]);

/**
 * 将 agent 状态映射为 GrokBot 状态；未知、空串或非字符串输入安全回退为 idle。
 */
export function mapAgentStatusToBotState(state: unknown): GrokBotState {
  if (typeof state !== 'string') return 'idle';
  return STATUS_TO_BOT_STATE.get(state) ?? 'idle';
}
