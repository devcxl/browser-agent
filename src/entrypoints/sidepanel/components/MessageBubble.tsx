import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from '../types';
import { cn, formatTime } from '../utils';
import { ToolCallCard } from './ToolCallCard';

interface Props {
  message: UIMessage;
}

const SAFE_URL_RE = /^(https?:|mailto:|tel:|#|\/)/i;

function isSafeUrl(url: string | undefined): boolean {
  if (!url) return false;
  return SAFE_URL_RE.test(url);
}

const markdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={isSafeUrl(href) ? href : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="px-1 py-0.5 rounded bg-gray-200 text-gray-800 text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }: React.HTMLAttributes<HTMLElement>) => (
    <pre className="my-2 p-2.5 rounded-lg bg-gray-800 text-gray-100 text-xs overflow-x-auto">
      {children}
    </pre>
  ),
};

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
        <div className="text-sm leading-relaxed">
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="markdown-body break-words [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-2 [&_blockquote]:text-gray-600 [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50 [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_hr]:my-2 [&_hr]:border-gray-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
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
