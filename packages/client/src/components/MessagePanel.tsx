import { useRef, useEffect, useState } from 'react';
import { useStore } from '../stores/store';
import { ChatBubble } from './ChatBubble';
import { ChannelHeader } from './ChannelHeader';

interface MessagePanelProps {
  readOnly?: boolean;
}

export function MessagePanel({ readOnly = false }: MessagePanelProps) {
  const messages = useStore((s) => s.messages);
  const channel = useStore((s) => s.channel);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput('');

    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, channel }),
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

  const bgClass = channel === 'whatsapp' ? 'bg-amber-50' : 'bg-white';

  return (
    <div className="flex flex-col h-full">
      <ChannelHeader channel={channel} />
      <div className={`flex-1 overflow-y-auto p-4 space-y-2 ${bgClass}`}>
        {messages.length === 0 && (
          <p className="text-center text-gray-400 mt-8">
            {readOnly ? 'Waiting for eval to start...' : 'Send a message to start the conversation'}
          </p>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {!readOnly && (
        <div className="border-t p-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="bg-blue-500 text-white rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
