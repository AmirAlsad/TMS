interface Reaction {
  emoji: string;
  fromUser: boolean;
}

interface ReactionBadgesProps {
  reactions: Reaction[];
  onRemove: (emoji: string) => void;
}

export function ReactionBadges({ reactions, onRemove }: ReactionBadgesProps) {
  if (reactions.length === 0) return null;

  // Group by emoji
  const grouped = new Map<string, { count: number; hasUser: boolean }>();
  for (const r of reactions) {
    const existing = grouped.get(r.emoji);
    if (existing) {
      existing.count++;
      if (r.fromUser) existing.hasUser = true;
    } else {
      grouped.set(r.emoji, { count: 1, hasUser: r.fromUser });
    }
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {[...grouped.entries()].map(([emoji, { count, hasUser }]) => (
        <button
          key={emoji}
          onClick={() => hasUser && onRemove(emoji)}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs
                      border transition-colors
                      ${
                        hasUser
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50'
                          : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 cursor-default'
                      }`}
        >
          <span className="text-sm">{emoji}</span>
          {count > 1 && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
