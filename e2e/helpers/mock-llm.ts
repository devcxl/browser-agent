import type { Route } from '@playwright/test';

function stopResponse(content: string) {
  return {
    id: 'mock-chat-' + Date.now(),
    choices: [{
      index: 0,
      message: { role: 'assistant' as const, content },
      finish_reason: 'stop' as const,
    }],
    usage: { prompt_tokens: 100, completion_tokens: content.length, total_tokens: 100 + content.length },
  };
}

function toolCallsResponse(
  ...toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
) {
  return {
    id: 'mock-chat-' + Date.now(),
    choices: [{
      index: 0,
      message: {
        role: 'assistant' as const,
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      },
      finish_reason: 'tool_calls' as const,
    }],
    usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
  };
}

export function createMockResponder(responses: object[]) {
  let index = 0;
  return async (route: Route) => {
    const response = responses[index] ?? responses[responses.length - 1];
    index++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  };
}

/** 普通对话 */
export const helloResponse = stopResponse('你好！我是 Browser Agent。');

/** 激活 caveman skill → 确认回复 */
export const skillCavemanResponses = [
  toolCallsResponse({ id: 'call_skill_1', name: 'skill', args: { name: 'caveman' } }),
  stopResponse('Me caveman. You ask. Me answer. Short words.'),
];

/** 空 skill 列表 — 正常对话 */
export const noSkillResponse = stopResponse('有什么可以帮你的？');

/** skill 匹配失败 */
export const skillNotFoundResponses = [
  toolCallsResponse({ id: 'call_skill_1', name: 'skill', args: { name: 'nonexistent' } }),
  stopResponse('我没有找到那个技能，有什么可以帮你的？'),
];
