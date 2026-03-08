import { useRef, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../stores/store';
import { ChatBubble } from './ChatBubble';
import { ChannelHeader } from './ChannelHeader';
import { QuotedReplyPreview } from './QuotedReplyPreview';
import { TypingIndicator } from './TypingIndicator';

interface MessagePanelProps {
  readOnly?: boolean;
}

export function MessagePanel({ readOnly = false }: MessagePanelProps) {
  const messages = useStore(useShallow((s) => s.messages.filter((m) => m.channel === s.channel)));
  const channel = useStore((s) => s.channel);
  const replyingTo = useStore((s) => s.replyingTo);
  const setReplyingTo = useStore((s) => s.setReplyingTo);
  const typingIndicator = useStore((s) => s.typingIndicator);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingIndicator]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput('');

    const body: Record<string, unknown> = { content, channel };
    if (replyingTo && channel === 'whatsapp') {
      body.quotedReply = {
        targetMessageId: replyingTo.id,
        quotedBody: replyingTo.content,
      };
    }

    setReplyingTo(null);

    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const chatBg =
    channel === 'whatsapp'
      ? 'bg-[#ece5dd] dark:bg-[#0b141a]'
      : 'bg-white dark:bg-slate-900';

  return (
    <div className="flex flex-col h-full">
      <ChannelHeader channel={channel} />

      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-1.5 scrollbar-thin ${chatBg}`}>
        {messages.length === 0 && (
          <p className="text-center text-slate-400 dark:text-slate-500 mt-12 text-sm">
            {readOnly ? 'Waiting for eval to start...' : 'Send a message to start'}
          </p>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {channel === 'whatsapp' && typingIndicator?.active && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {!readOnly && (
        <>
          {replyingTo && channel === 'whatsapp' && (
            <QuotedReplyPreview message={replyingTo} onCancel={() => setReplyingTo(null)} />
          )}
          <div
            className={`px-3 pt-2 pb-7 flex items-end gap-2 border-t
                        ${
                          channel === 'whatsapp'
                            ? 'bg-[#f0f0f0] dark:bg-[#1f2c34] border-[#d1d1d1] dark:border-[#2a3942]'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1 rounded-full px-4 py-2 text-sm
                         bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
                         border border-slate-200 dark:border-slate-600
                         placeholder:text-slate-400 dark:placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-400/50 dark:focus:ring-indigo-500/40
                         transition-shadow"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                         bg-indigo-500 hover:bg-indigo-600 text-white
                         disabled:opacity-40 disabled:hover:bg-indigo-500
                         transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
