import React, { useState, useEffect } from 'react';
import type { UIMessage } from '../types';
import { cn, formatTime } from '../utils';
import { ToolCallCard } from './ToolCallCard';

interface Props {
  message: UIMessage;
}

export function MessageBubble({ message }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);

  // 流式过程中自动展开思考面板
  const isStreaming = message.status === 'streaming';
  const hasReasoning = message.role === 'assistant' && !!message.reasoningContent;
  useEffect(() => {
    if (isStreaming && hasReasoning) {
      setShowReasoning(true);
    }
  }, [isStreaming, hasReasoning]);

  if (message.role === 'tool') {
    return (
      <div className="flex justify-center my-1">
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-500 max-w-[80%]">
          <span className="font-medium">{message.content}</span>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={cn('flex mb-3', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-blue-500 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md',
        )}
      >
        {/* 思考内容（推理过程） */}
        {hasReasoning && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className="text-xs">{showReasoning ? '▼' : '▶'}</span>
              <span>{showReasoning ? '收起思考过程' : '查看思考过程'}</span>
            </button>
            {showReasoning && (
              <div className="mt-1.5 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 whitespace-pre-wrap break-words leading-relaxed">
                {message.reasoningContent}
              </div>
            )}
          </div>
        )}

        {/* 主要消息内容 */}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse" />
          )}
        </div>
        <div
          className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-blue-200' : 'text-gray-400',
          )}
        >
          {formatTime(message.timestamp)}
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} call={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
