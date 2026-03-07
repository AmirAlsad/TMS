import type { MessageRole } from '@tms/shared';

interface QuotedReplyBlockProps {
  role: MessageRole;
  content: string;
}

export function QuotedReplyBlock({ role, content }: QuotedReplyBlockProps) {
  const senderName = role === 'user' ? 'You' : 'Bot';
  const snippet = content.length > 100 ? content.slice(0, 100) + '...' : content;

  return (
    <div
      className="border-l-[3px] border-emerald-500/70 pl-2 py-1 mb-1 rounded-r
                 bg-black/5 dark:bg-white/5"
    >
      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        {senderName}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{snippet}</p>
    </div>
  );
}
