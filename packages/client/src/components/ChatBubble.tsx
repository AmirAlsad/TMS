import { useState } from 'react';
import type { Message, ReadStatus } from '@tms/shared';
import { FormattedContent } from './FormattedContent.js';
import { ReactionPicker } from './ReactionPicker.js';
import { ReactionBadges } from './ReactionBadges.js';
import { QuotedReplyBlock } from './QuotedReplyBlock.js';
import { useStore } from '../stores/store.js';

interface ChatBubbleProps {
  message: Message;
}

function CheckMarks({ status }: { status: ReadStatus }) {
  if (status === 'sent') {
    return (
      <svg className="inline-block ml-1 w-4 h-3 text-slate-400 dark:text-slate-500" viewBox="0 0 16 12" fill="none">
        <path
          d="M1 6l3 3L11 1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const color = status === 'read' ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500';

  return (
    <svg className={`inline-block ml-1 w-4 h-3 ${color}`} viewBox="0 0 16 12" fill="none">
      <path
        d="M1 6l3 3L11 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 6l3 3L15 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isWhatsApp = message.channel === 'whatsapp';
  const [showPicker, setShowPicker] = useState(false);
  const [hovered, setHovered] = useState(false);

  const readState = useStore((s) => s.messageReadStates[message.id]) ?? 'sent';
  const reactions = useStore((s) => s.messageReactions[message.id]) ?? [];
  const readReceiptMode = useStore((s) => s.readReceiptMode);
  const setReadState = useStore((s) => s.setReadState);
  const quotedOriginalRole = useStore((s) => {
    if (!message.quotedReply) return undefined;
    const orig = s.messages.find((m) => m.id === message.quotedReply!.targetMessageId);
    return orig?.role;
  });
  const setReplyingTo = useStore((s) => s.setReplyingTo);
  const addReaction = useStore((s) => s.addReaction);
  const removeReaction = useStore((s) => s.removeReaction);

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleReactionSelect = async (emoji: string) => {
    setShowPicker(false);
    addReaction(message.id, emoji, true);
    try {
      const res = await fetch('/api/whatsapp/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMessageId: message.id, emoji, fromUser: true }),
      });
      if (!res.ok) {
        console.error('Failed to send reaction:', res.status);
        removeReaction(message.id, emoji, true);
      }
    } catch (err) {
      console.error('Failed to send reaction:', err);
      removeReaction(message.id, emoji, true);
    }
  };

  const handleReactionRemove = async (emoji: string) => {
    removeReaction(message.id, emoji, true);
    try {
      const res = await fetch('/api/whatsapp/reaction/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMessageId: message.id, emoji, fromUser: true }),
      });
      if (!res.ok) {
        console.error('Failed to remove reaction:', res.status);
        addReaction(message.id, emoji, true);
      }
    } catch (err) {
      console.error('Failed to remove reaction:', err);
      addReaction(message.id, emoji, true);
    }
  };

  const handleManualRead = async () => {
    if (readState === 'read' || isUser) return;
    setReadState(message.id, 'read');
    try {
      await fetch('/api/whatsapp/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upToMessageId: message.id }),
      });
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const showManualRead = isWhatsApp && !isUser && readReceiptMode === 'manual' && readState !== 'read';

  if (isWhatsApp) {
    const bubbleStyles = isUser
      ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-white ml-auto rounded-tr-none'
      : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 mr-auto rounded-tl-none';

    const timeStyles = isUser
      ? 'text-slate-500 dark:text-emerald-300/60'
      : 'text-slate-400 dark:text-slate-500';

    return (
      <div
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setShowPicker(false);
        }}
      >
        <div className={`relative max-w-[75%] px-3 py-1.5 rounded-lg shadow-sm ${bubbleStyles}`}>
          {/* Hover actions */}
          {hovered && (
            <div
              className={`absolute top-1 z-20 flex gap-0.5 ${isUser ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'}`}
            >
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="w-6 h-6 flex items-center justify-center rounded-full
                           bg-white dark:bg-slate-700 shadow border border-slate-200
                           dark:border-slate-600 text-slate-400 hover:text-slate-600
                           dark:hover:text-slate-200 transition-colors text-xs"
                title="React"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                </svg>
              </button>
              <button
                onClick={() => setReplyingTo(message)}
                className="w-6 h-6 flex items-center justify-center rounded-full
                           bg-white dark:bg-slate-700 shadow border border-slate-200
                           dark:border-slate-600 text-slate-400 hover:text-slate-600
                           dark:hover:text-slate-200 transition-colors text-xs"
                title="Reply"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
              </button>
            </div>
          )}

          {/* Reaction picker */}
          {showPicker && (
            <div className={`absolute z-30 ${isUser ? 'right-0' : 'left-0'}`} style={{ bottom: '100%' }}>
              <ReactionPicker onSelect={handleReactionSelect} onClose={() => setShowPicker(false)} />
            </div>
          )}

          {/* Quoted reply */}
          {message.quotedReply && (
            <QuotedReplyBlock role={quotedOriginalRole ?? (isUser ? 'bot' : 'user')} content={message.quotedReply.quotedBody} />
          )}

          <FormattedContent content={message.content} channel={message.channel} role={message.role} />

          {/* Reaction badges */}
          {reactions.length > 0 && (
            <ReactionBadges reactions={reactions} onRemove={handleReactionRemove} />
          )}

          <p className={`text-[10px] mt-0.5 text-right flex items-center justify-end gap-1 ${timeStyles}`}>
            {time}
            {isUser && <CheckMarks status="delivered" />}
            {!isUser && <CheckMarks status={readState} />}
            {showManualRead && (
              <button
                onClick={handleManualRead}
                className="ml-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded
                           bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400
                           hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                title="Mark as read"
              >
                Read
              </button>
            )}
          </p>
        </div>
      </div>
    );
  }

  // SMS / iMessage style
  const bubbleStyles = isUser
    ? 'bg-indigo-500 text-white ml-auto'
    : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 mr-auto';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${bubbleStyles}`}>
        <FormattedContent content={message.content} channel={message.channel} role={message.role} />
        <p
          className={`text-[10px] mt-0.5 ${isUser ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}
        >
          {time}
        </p>
      </div>
    </div>
  );
}
