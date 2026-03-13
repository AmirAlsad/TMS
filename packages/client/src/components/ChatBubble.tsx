import { useState } from 'react';
import type { Message, ReadStatus } from '@tms/shared';
import { FormattedContent } from './FormattedContent.js';
import { ReactionPicker } from './ReactionPicker.js';
import { ReactionBadges } from './ReactionBadges.js';
import { QuotedReplyBlock } from './QuotedReplyBlock.js';
import { MediaContent } from './MediaContent.js';
import { useStore } from '../stores/store.js';

export interface ChatBubbleProps {
  message: Message;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
}

function CheckMarks({ status }: { status: ReadStatus }) {
  if (status === 'sent') {
    return (
      <svg
        className="inline-block ml-1 w-4 h-3 text-slate-400 dark:text-slate-500"
        viewBox="0 0 16 12"
        fill="none"
      >
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

/** WhatsApp tail — small triangle at top corner of first message in group */
function WhatsAppTail({ isUser }: { isUser: boolean }) {
  return (
    <svg
      className={`absolute top-0 w-2 h-3 ${
        isUser
          ? '-right-1.5 text-whatsapp-bubble-user dark:text-whatsapp-bubble-user-dark'
          : '-left-1.5 text-whatsapp-bubble-bot dark:text-whatsapp-bubble-bot-dark'
      }`}
      viewBox="0 0 8 13"
      fill="currentColor"
    >
      {isUser ? (
        <path d="M0 0 L0 13 L8 0 Z" />
      ) : (
        <path d="M8 0 L8 13 L0 0 Z" />
      )}
    </svg>
  );
}

/** SMS tail — curved tail at bottom corner of last message in group */
function SmsTail({ isUser }: { isUser: boolean }) {
  return (
    <svg
      className={`absolute bottom-0 w-3 h-4 ${
        isUser ? '-right-2 text-indigo-500' : '-left-2 text-slate-100 dark:text-slate-700'
      }`}
      viewBox="0 0 12 16"
      fill="currentColor"
    >
      {isUser ? (
        <path d="M0 0 C0 8 4 14 12 16 C8 14 4 10 4 0 Z" />
      ) : (
        <path d="M12 0 C12 8 8 14 0 16 C4 14 8 10 8 0 Z" />
      )}
    </svg>
  );
}

export function ChatBubble({
  message,
  isFirstInGroup = true,
  isLastInGroup = true,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isWhatsApp = message.channel === 'whatsapp';
  const [showPicker, setShowPicker] = useState(false);
  const [hovered, setHovered] = useState(false);

  // ALL useStore calls must come before any conditional return (Rules of Hooks)
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

  // --- Silence indicator ---
  if (message.silence) {
    return (
      <div className="flex justify-center py-1 animate-slide-up">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                     text-[11px] font-medium text-slate-400 dark:text-slate-500
                     bg-slate-100/60 dark:bg-slate-800/40"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Bot chose not to respond
        </span>
      </div>
    );
  }

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const hasMedia = !!message.mediaType && !!message.mediaUrl;
  const isSticker = isWhatsApp && message.mediaType === 'image/webp';

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

  const showManualRead =
    isWhatsApp && !isUser && readReceiptMode === 'manual' && readState !== 'read';

  // --- WhatsApp ---
  if (isWhatsApp) {
    // Border radius based on grouping
    const userRadius = isFirstInGroup
      ? 'rounded-lg rounded-tr-none'
      : isLastInGroup
        ? 'rounded-lg rounded-br-sm'
        : 'rounded-lg rounded-r-sm';
    const botRadius = isFirstInGroup
      ? 'rounded-lg rounded-tl-none'
      : isLastInGroup
        ? 'rounded-lg rounded-bl-sm'
        : 'rounded-lg rounded-l-sm';

    const bubbleStyles = isUser
      ? `bg-whatsapp-bubble-user dark:bg-whatsapp-bubble-user-dark text-slate-900 dark:text-white ml-auto ${userRadius}`
      : `bg-whatsapp-bubble-bot dark:bg-whatsapp-bubble-bot-dark text-slate-900 dark:text-slate-100 mr-auto ${botRadius}`;

    const timeStyles = isUser
      ? 'text-slate-500 dark:text-emerald-300/60'
      : 'text-slate-400 dark:text-slate-500';

    return (
      <div
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'animate-slide-up' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
        }}
      >
        <div
          className={`relative max-w-[75%] ${isSticker ? '' : `px-3 py-1.5 shadow-sm ${bubbleStyles}`}`}
        >
          {/* WhatsApp tail on first message in group */}
          {isFirstInGroup && !isSticker && <WhatsAppTail isUser={isUser} />}

          {/* Hover actions */}
          {(hovered || showPicker) && (
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
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z"
                  />
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
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Reaction picker */}
          {showPicker && (
            <div
              className={`absolute z-30 ${isUser ? 'right-0' : 'left-0'}`}
              style={{ bottom: '100%' }}
            >
              <ReactionPicker
                onSelect={handleReactionSelect}
                onClose={() => setShowPicker(false)}
                align={isUser ? 'right' : 'left'}
              />
            </div>
          )}

          {/* Quoted reply */}
          {message.quotedReply && (
            <QuotedReplyBlock
              role={quotedOriginalRole ?? (isUser ? 'bot' : 'user')}
              content={message.quotedReply.quotedBody}
            />
          )}

          {/* Media */}
          {hasMedia && (
            <MediaContent
              mediaType={message.mediaType!}
              mediaUrl={message.mediaUrl!}
              channel={message.channel}
              transcription={message.transcription}
            />
          )}

          {message.content && (
            <span className="text-[15px]">
              <FormattedContent
                content={message.content}
                channel={message.channel}
                role={message.role}
              />
            </span>
          )}

          {/* Reaction badges */}
          {reactions.length > 0 && (
            <ReactionBadges reactions={reactions} onRemove={handleReactionRemove} />
          )}

          {/* Timestamp — only on last message in group */}
          {isLastInGroup && (
            <p
              className={`text-[11px] mt-0.5 text-right flex items-center justify-end gap-1 ${timeStyles}`}
            >
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
          )}
        </div>
      </div>
    );
  }

  // --- SMS ---
  const userRadius = isFirstInGroup
    ? 'rounded-2xl rounded-br-md'
    : isLastInGroup
      ? 'rounded-2xl rounded-tr-md'
      : 'rounded-2xl rounded-r-md';
  const botRadius = isFirstInGroup
    ? 'rounded-2xl rounded-bl-md'
    : isLastInGroup
      ? 'rounded-2xl rounded-tl-md'
      : 'rounded-2xl rounded-l-md';

  const bubbleStyles = isUser
    ? `bg-indigo-500 text-white ml-auto ${userRadius}`
    : `bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 mr-auto ${botRadius}`;

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'animate-slide-up' : ''}`}
    >
      <div className={`relative max-w-[75%] px-3.5 py-2 ${bubbleStyles}`}>
        {/* SMS tail on last message in group */}
        {isLastInGroup && <SmsTail isUser={isUser} />}

        {hasMedia && (
          <MediaContent
            mediaType={message.mediaType!}
            mediaUrl={message.mediaUrl!}
            channel={message.channel}
            transcription={message.transcription}
          />
        )}
        {message.content && (
          <span className="text-[15px]">
            <FormattedContent
              content={message.content}
              channel={message.channel}
              role={message.role}
            />
          </span>
        )}
        {/* Timestamp — only on last message in group */}
        {isLastInGroup && (
          <p
            className={`text-[11px] mt-0.5 ${isUser ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}
          >
            {time}
          </p>
        )}
      </div>
    </div>
  );
}
