import type { Message } from '@tms/shared';

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
      ? 'bg-emerald-600 text-white ml-auto rounded-tr-none'
      : 'bg-white text-gray-900 mr-auto rounded-tl-none shadow-sm';

    const timeStyles = isUser ? 'text-emerald-200' : 'text-gray-400';

    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-xs lg:max-w-md px-3 py-1.5 rounded-lg ${bubbleStyles}`}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          <p className={`text-[10px] mt-0.5 text-right ${timeStyles}`}>
            {time}
            {isUser && <CheckMarks />}
          </p>
        </div>
      </div>
    );
  }

  // SMS styling
  const bubbleStyles = isUser
    ? 'bg-blue-500 text-white ml-auto'
    : 'bg-gray-200 text-gray-900 mr-auto';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${bubbleStyles}`}>
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p className={`text-xs mt-1 ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>{time}</p>
      </div>
    </div>
  );
}
