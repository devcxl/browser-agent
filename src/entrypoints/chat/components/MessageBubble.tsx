import React from 'react';
import type { UIMessage } from '../types';
import { cn, formatTime } from '../utils';
import { ToolCallCard } from './ToolCallCard';

interface Props {
  message: UIMessage;
}

export function MessageBubble({ message }: Props) {
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
  const isStreaming = message.status === 'streaming';

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
