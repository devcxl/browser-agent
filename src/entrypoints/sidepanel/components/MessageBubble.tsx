import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage, ToolCallDisplay } from '../types';
import { cn, formatTime, riskColor, truncate } from '../utils';

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
      className="text-primary underline"
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
        className="px-1 py-0.5 rounded-md bg-surface-soft text-ink text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }: React.HTMLAttributes<HTMLElement>) => (
    <pre className="my-2 p-2.5 rounded-md bg-surface-dark text-on-dark text-xs overflow-x-auto">
      {children}
    </pre>
  ),
};

export function MessageBubble({ message }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);

  const isStreaming = message.status === 'streaming';
  const hasReasoning = message.role === 'assistant' && !!message.reasoningContent;
  useEffect(() => {
    if (isStreaming && hasReasoning) {
      setShowReasoning(true);
    }
  }, [isStreaming, hasReasoning]);

  if (message.role === 'tool') {
    if (message.toolCallDisplay) {
      return <ToolBubble call={message.toolCallDisplay} />;
    }
    return (
      <div className="flex justify-center my-1">
        <div className="bg-surface-soft border border-hairline rounded-md px-3 py-1.5 text-xs text-mute max-w-[80%]">
          <span className="font-medium">{message.content}</span>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div data-testid="message-bubble" className={cn('flex mb-3', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] px-4 py-2.5',
          isUser
            ? 'bg-primary text-on-primary rounded-2xl rounded-br-md'
            : 'bg-surface-card text-ink rounded-2xl rounded-bl-md border border-hairline',
        )}
      >
        {hasReasoning && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1.5 text-xs text-mute hover:text-ink transition-colors"
            >
              <span className="text-xs">{showReasoning ? '▼' : '▶'}</span>
              <span>{showReasoning ? '收起思考过程' : '查看思考过程'}</span>
            </button>
            {showReasoning && (
              <div className="mt-1.5 p-2.5 bg-yellow-50 border border-warning/20 rounded-md text-xs text-yellow-800 whitespace-pre-wrap break-words leading-relaxed">
                {message.reasoningContent}
              </div>
            )}
          </div>
        )}

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
          {isStreaming && message.content && (
            <span className="inline-block w-1.5 h-4 bg-ink ml-0.5 animate-pulse" />
          )}
        </div>
        <div
          className={cn(
            'text-[10px] mt-1',
            isUser ? 'text-on-dark-soft' : 'text-mute',
          )}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function ToolBubble({ call }: { call: ToolCallDisplay }) {
  const [expanded, setExpanded] = useState(false);

  const isHighRisk = call.riskLevel === 'high' || call.riskLevel === 'critical';

  return (
    <div className="flex justify-start mb-3">
      <div className={cn(
        'max-w-[80%] bg-surface-card rounded-2xl rounded-bl-md border overflow-hidden',
        isHighRisk ? 'border-orange-400' : 'border-hairline',
      )}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-surface-soft transition-colors"
        >
          <span className="text-xs text-mute">{expanded ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-ink flex-1">
            {call.name}
          </span>
          <span className={cn('text-[10px] font-medium', riskColor(call.riskLevel).split(' ')[0])}>
            {call.riskLevel}
          </span>
          {call.status === 'running' && (
            <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {call.status === 'success' && <span className="text-success text-sm">✓</span>}
          {call.status === 'error' && <span className="text-danger text-sm">✕</span>}
        </button>
        {expanded && (
          <div className="px-4 pb-3 pt-1 bg-surface-soft border-t border-hairline space-y-1.5 text-xs">
            <div>
              <span className="font-medium text-mute">参数: </span>
              <code className="text-body break-all">
                {truncate(JSON.stringify(call.params), 200)}
              </code>
            </div>
            {call.result && (
              <div>
                <span className="font-medium text-mute">结果: </span>
                <code className="text-body break-all">
                  {call.result.success
                    ? truncate(JSON.stringify(call.result.data ?? 'ok'), 200)
                    : call.result.error}
                </code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
