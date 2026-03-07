import type { Message } from '@tms/shared';

interface QuotedReplyPreviewProps {
  message: Message;
  onCancel: () => void;
}

export function QuotedReplyPreview({ message, onCancel }: QuotedReplyPreviewProps) {
  const senderName = message.role === 'user' ? 'You' : 'Bot';
  const snippet =
    message.content.length > 80 ? message.content.slice(0, 80) + '...' : message.content;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2
                 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700"
    >
      <div
        className="flex-1 border-l-[3px] border-emerald-500 pl-2 min-w-0"
      >
        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          {senderName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{snippet}</p>
      </div>
      <button
        onClick={onCancel}
        className="shrink-0 p-1 rounded-full text-slate-400 hover:text-slate-600
                   dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700
                   transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
