/**
 * E2E 用的 OpenAI-compatible SSE mock。
 *
 * Agent 主循环走 AI SDK `ToolLoopAgent.stream()`，其底层
 * `@ai-sdk/openai-compatible` 要求响应为 `text/event-stream`，每个
 * `data:` 行是一个 chat.completion.chunk（形状见该包的 chunkBaseSchema）。
 * 返回普通 JSON 会导致流解析失败、回复为空——因此此处必须构造 SSE。
 */

import type { Route } from '@playwright/test';

/** 构造一个 SSE 响应体：先逐段 content，再 finish，最后 [DONE] */
function sseBody(chunks: object[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
}

/** 纯文本回复的 SSE 分片序列 */
function textChunks(content: string) {
  const id = 'mock-chat-' + Date.now();
  const model = 'mock-model';
  return [
    { id, object: 'chat.completion.chunk', created: Date.now(), model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
    { id, object: 'chat.completion.chunk', created: Date.now(), model, choices: [{ index: 0, delta: { content }, finish_reason: null }] },
    {
      id,
      object: 'chat.completion.chunk',
      created: Date.now(),
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: content.length, total_tokens: 100 + content.length },
    },
  ];
}

/** 工具调用 + 文本回复的 SSE 分片序列 */
function toolCallChunks(
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
  finalText: string,
) {
  const id = 'mock-chat-' + Date.now();
  const model = 'mock-model';
  const created = Date.now();
  const base = { id, object: 'chat.completion.chunk', created, model };

  const callChunks = toolCalls.map((tc, i) => ({
    ...base,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: i,
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }],
      },
      finish_reason: null,
    }],
  }));

  return [
    { ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
    ...callChunks,
    {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
    },
    { ...base, choices: [{ index: 0, delta: { content: finalText }, finish_reason: null }] },
    {
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 150, completion_tokens: finalText.length, total_tokens: 150 + finalText.length },
    },
  ];
}

/** 把「一轮响应」转成 SSE 响应体 */
function toSse(response: object): string {
  const choices = (response as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }; finish_reason?: string }>;
  }).choices ?? [];
  const message = choices[0]?.message;
  const toolCalls = message?.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  return toolCalls?.length
    ? sseBody(toolCallChunks(toolCalls, ''))
    : sseBody(textChunks(message?.content ?? ''));
}

/** 按顺序回放多轮响应的 route handler（每轮一条 SSE） */
export function createMockResponder(responses: object[]) {
  let index = 0;
  return async (route: Route) => {
    const response = responses[index] ?? responses[responses.length - 1];
    index++;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: toSse(response!),
    });
  };
}

function stopResponse(content: string) {
  return {
    id: 'mock-chat-' + Date.now(),
    choices: [{
      index: 0,
      message: { role: 'assistant' as const, content },
      finish_reason: 'stop' as const,
    }],
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
  };
}

/** 普通对话 */
export const helloResponse = stopResponse('你好！我是 Browser Agent。');

/** 激活 caveman skill：先调用 skill 工具，再以 caveman 口吻回复 */
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
