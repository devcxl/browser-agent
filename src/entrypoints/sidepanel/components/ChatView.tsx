import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { UIMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: UIMessage[];
}

const OVERSCAN = 10;
const ITEM_HEIGHT = 80;

export function ChatView({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAutoScroll(atBottom);
    setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, messages[messages.length - 1]?.content, autoScroll]);

  // Simple virtual scroll for > 100 messages
  const useVirtual = messages.length > 100;
  let visibleMessages = messages;
  let containerStyle: React.CSSProperties = {};
  let paddingTop = 0;
  let paddingBottom = 0;

  if (useVirtual && containerRef.current) {
    const containerHeight = containerRef.current.clientHeight || 600;
    const totalHeight = messages.length * ITEM_HEIGHT;
    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(messages.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
    visibleMessages = messages.slice(startIndex, endIndex);
    paddingTop = startIndex * ITEM_HEIGHT;
    paddingBottom = totalHeight - endIndex * ITEM_HEIGHT;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 scroll-smooth flex flex-col"
    >
      {useVirtual ? (
        <div style={{ paddingTop, paddingBottom }}>
          {visibleMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      ) : (
        <>
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-mute text-sm">
                开始对话，发送消息给 Browser Agent
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
