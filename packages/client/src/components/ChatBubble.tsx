import type { Message } from '@tms/shared';
import { FormattedContent } from './FormattedContent.js';

interface ChatBubbleProps {
  message: Message;
}

function CheckMarks() {
  return (
    <svg className="inline-block ml-1 w-4 h-3" viewBox="0 0 16 12" fill="none">
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

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isWhatsApp) {
    const bubbleStyles = isUser
      ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-white ml-auto rounded-tr-none'
      : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 mr-auto rounded-tl-none';

    const timeStyles = isUser
      ? 'text-slate-500 dark:text-emerald-300/60'
      : 'text-slate-400 dark:text-slate-500';

    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
        <div className={`max-w-[75%] px-3 py-1.5 rounded-lg shadow-sm ${bubbleStyles}`}>
          <FormattedContent content={message.content} channel={message.channel} role={message.role} />
          <p className={`text-[10px] mt-0.5 text-right ${timeStyles}`}>
            {time}
            {isUser && <CheckMarks />}
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
