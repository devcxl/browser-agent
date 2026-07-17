import { useChat } from '@ai-sdk/react';
import { DirectChatTransport } from 'ai';
import { ToolLoopAdapter } from '@/agent/tool-loop-adapter';

/**
 * 使用 AI SDK 的 useChat hook + DirectChatTransport 实现无服务端的聊天 UI。
 *
 * 与 useAgent 不同，此 hook 由 AI SDK 框架管理消息列表、流式响应和状态，
 * 无需手动构建 UIMessage、管理 streaming 状态等。
 */
export function useChatAgent(adapter: ToolLoopAdapter) {
  const transport = new DirectChatTransport({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: adapter as any,
  });

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
  });

  return { messages, sendMessage, status, error, stop };
}
