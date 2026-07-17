import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isTextUIPart, isReasoningUIPart, isToolUIPart } from 'ai';
import type { UIMessage, ToolCallDisplay } from '../types';
import { cn, formatTime, riskColor, truncate } from '../utils';
import { useI18n } from '../i18n/useI18n';

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

// ─── 辅助函数 ────────────────────────────────────────────

function partsToText(parts: UIMessage['parts']): string {
  if (!parts) return '';
  return parts.filter(isTextUIPart).map((p) => p.text).join('');
}

function partsToReasoning(parts: UIMessage['parts']): string {
  if (!parts) return '';
  return parts.filter(isReasoningUIPart).map((p) => p.text).join('');
}

function partsHasTool(parts: UIMessage['parts']): boolean {
  if (!parts) return false;
  return parts.some(isToolUIPart);
}

function partsIsStreaming(parts: UIMessage['parts']): boolean {
  if (!parts) return false;
  return parts.some(
    (p) =>
      (isTextUIPart(p) && p.state === 'streaming') ||
      (isReasoningUIPart(p) && p.state === 'streaming'),
  );
}

/** AI SDK 工具调用 state → 旧 status */
function sdkStateToStatus(state: string): 'running' | 'success' | 'error' {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
    case 'approval-requested':
    case 'approval-responded':
      return 'running';
    case 'output-available':
      return 'success';
    case 'output-error':
    case 'output-denied':
      return 'error';
    default:
      return 'running';
  }
}

// ─── 主组件 ──────────────────────────────────────────────

export function MessageBubble({ message }: Props) {
  const { t } = useI18n();

  // AI SDK 格式：message.parts 存在时走 SDK 渲染路径
  if (message.parts) {
    return <MessageBubbleSDK message={message} t={t} />;
  }

  // 旧格式路径
  return <MessageBubbleLegacy message={message} t={t} />;
}

// ─── 旧格式渲染 ──────────────────────────────────────────

function MessageBubbleLegacy({
  message,
  t,
}: {
  message: UIMessage;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  const isStreaming = message.status === 'streaming';
  const hasReasoning = message.role === 'assistant' && !!message.reasoningContent;

  useEffect(() => {
    if (isStreaming && hasReasoning) {
      setShowReasoning(true);
    }
  }, [isStreaming, hasReasoning]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

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
    <div
      data-testid="message-bubble"
      className={cn('flex mb-3', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[80%] px-4 py-2.5 relative',
          isUser
            ? 'bg-primary text-on-primary rounded-2xl rounded-br-md'
            : 'bg-surface-card text-ink rounded-2xl rounded-bl-md border border-hairline',
        )}
      >
        {message.content && (
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'absolute top-1.5 right-1.5 p-1 rounded-md transition-all duration-200',
              'opacity-40 hover:opacity-100',
              isUser
                ? 'text-on-primary hover:bg-white/20'
                : 'text-mute hover:text-ink hover:bg-surface-soft',
            )}
            title={t('chat.message.copy')}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        )}
        {hasReasoning && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1.5 text-xs text-mute hover:text-ink transition-colors"
            >
              <span className="text-xs">{showReasoning ? '▼' : '▶'}</span>
              <span>{showReasoning ? t('chat.message.hideReasoning') : t('chat.message.showReasoning')}</span>
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
          ) : isStreaming && !message.content ? (
            <div className="flex items-center gap-1.5 text-mute">
              <span className="inline-block w-1.5 h-1.5 bg-mute rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="inline-block w-1.5 h-1.5 bg-mute rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="inline-block w-1.5 h-1.5 bg-mute rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-0.5 text-xs">{t('chat.message.thinking')}</span>
            </div>
          ) : (
            <div className="markdown-body break-words [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-2 [&_blockquote]:text-gray-600 [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50 [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_hr]:my-2 [&_hr]:border-gray-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content!}
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
          {formatTime(message.timestamp ?? Date.now())}
        </div>
      </div>
    </div>
  );
}

// ─── AI SDK parts 渲染 ────────────────────────────────────

function MessageBubbleSDK({
  message,
  t,
}: {
  message: UIMessage;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const parts = message.parts!;
  const textContent = partsToText(parts);
  const reasoningContent = partsToReasoning(parts);
  const hasTools = partsHasTool(parts);
  const isStreaming = partsIsStreaming(parts);
  const toolParts = parts.filter(isToolUIPart);

  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasReasoning = message.role === 'assistant' && !!reasoningContent;

  useEffect(() => {
    if (isStreaming && hasReasoning) {
      setShowReasoning(true);
    }
  }, [isStreaming, hasReasoning]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  const isUser = message.role === 'user';

  return (
    <>
      {/* 工具调用：每个 tool part 作为独立卡片 */}
      {hasTools &&
        toolParts.map((part) => (
          <SDKToolBubble key={part.toolCallId} part={part} t={t} />
        ))}

      {/* 文本/推理内容气泡 */}
      {(textContent || reasoningContent || isStreaming) && (
        <div
          data-testid="message-bubble"
          className={cn('flex mb-3', isUser ? 'justify-end' : 'justify-start')}
        >
          <div
            className={cn(
              'max-w-[80%] px-4 py-2.5 relative',
              isUser
                ? 'bg-primary text-on-primary rounded-2xl rounded-br-md'
                : 'bg-surface-card text-ink rounded-2xl rounded-bl-md border border-hairline',
            )}
          >
            {textContent && (
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'absolute top-1.5 right-1.5 p-1 rounded-md transition-all duration-200',
                  'opacity-40 hover:opacity-100',
                  isUser
                    ? 'text-on-primary hover:bg-white/20'
                    : 'text-mute hover:text-ink hover:bg-surface-soft',
                )}
                title={t('chat.message.copy')}
              >
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            )}
            {hasReasoning && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setShowReasoning(!showReasoning)}
                  className="flex items-center gap-1.5 text-xs text-mute hover:text-ink transition-colors"
                >
                  <span className="text-xs">{showReasoning ? '▼' : '▶'}</span>
                  <span>{showReasoning ? t('chat.message.hideReasoning') : t('chat.message.showReasoning')}</span>
                </button>
                {showReasoning && (
                  <div className="mt-1.5 p-2.5 bg-yellow-50 border border-warning/20 rounded-md text-xs text-yellow-800 whitespace-pre-wrap break-words leading-relaxed">
                    {reasoningContent}
                  </div>
                )}
              </div>
            )}

            <div className="text-sm leading-relaxed">
              {isUser ? (
                <div className="whitespace-pre-wrap break-words">{textContent}</div>
              ) : isStreaming && !textContent ? (
                <div className="flex items-center gap-1.5 text-mute">
                  <span className="inline-block w-1.5 h-1.5 bg-mute rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-mute rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-mute rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-0.5 text-xs">{t('chat.message.thinking')}</span>
                </div>
              ) : (
                <div className="markdown-body break-words [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-2 [&_blockquote]:text-gray-600 [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50 [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_hr]:my-2 [&_hr]:border-gray-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {textContent}
                  </ReactMarkdown>
                </div>
              )}
              {isStreaming && textContent && (
                <span className="inline-block w-1.5 h-4 bg-ink ml-0.5 animate-pulse" />
              )}
            </div>
            <div
              className={cn(
                'text-[10px] mt-1',
                isUser ? 'text-on-dark-soft' : 'text-mute',
              )}
            >
              {formatTime(message.timestamp ?? Date.now())}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 旧格式 ToolBubble ────────────────────────────────────

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

// ─── AI SDK 工具调用气泡 ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SDKToolBubble({ part, t }: { part: any; t: ReturnType<typeof useI18n>['t'] }) {
  const [expanded, setExpanded] = useState(false);

  const toolName = 'toolName' in part ? part.toolName : part.type?.replace('tool-', '') ?? 'tool';
  const status = sdkStateToStatus(part.state);
  const input = part.input ?? part.args;
  const output = part.output;

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[80%] bg-surface-card rounded-2xl rounded-bl-md border border-hairline overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-surface-soft transition-colors"
        >
          <span className="text-xs text-mute">{expanded ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-ink flex-1">{toolName}</span>
          <span className="text-[10px] font-medium text-mute">{part.state}</span>
          {status === 'running' && (
            <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {status === 'success' && <span className="text-success text-sm">✓</span>}
          {status === 'error' && <span className="text-danger text-sm">✕</span>}
        </button>
        {expanded && (
          <div className="px-4 pb-3 pt-1 bg-surface-soft border-t border-hairline space-y-1.5 text-xs">
            {input != null && (
              <div>
                <span className="font-medium text-mute">{t('chat.message.params')}: </span>
                <code className="text-body break-all">
                  {truncate(JSON.stringify(input), 200)}
                </code>
              </div>
            )}
            {output != null && (
              <div>
                <span className="font-medium text-mute">{t('chat.message.result')}: </span>
                <code className="text-body break-all">
                  {truncate(JSON.stringify(output), 200)}
                </code>
              </div>
            )}
            {part.errorText && (
              <div>
                <span className="font-medium text-mute">{t('chat.message.result')}: </span>
                <code className="text-danger break-all">{part.errorText}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
