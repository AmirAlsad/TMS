import { useEffect, useRef, useState } from 'react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
      '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄',
      '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷',
      '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵',
      '🤯', '😎', '🥸', '🤠', '😈', '👿', '👻', '💀',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌',
      '👐', '🤲', '🤝', '🙏', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚',
      '🖐️', '✋', '🖖', '💪', '🦾', '🫶',
    ],
  },
  {
    label: 'Hearts',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖',
      '💘', '💝',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '🔥', '⭐', '🌟', '✨', '💥', '💯', '🎉', '🎊',
      '🏆', '🥇', '🎯', '💡', '🔔', '🎵', '🎶', '💐',
      '🌹', '☕', '🍕', '🍔', '🎂', '🍰', '🥂', '🍻',
    ],
  },
];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
}

export function ReactionPicker({ onSelect, onClose, align = 'left' }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div ref={ref} className={`absolute bottom-full mb-1 ${alignClass} z-30`}>
      {/* Expanded emoji grid */}
      {expanded && (
        <div
          className={`mb-1 w-72 max-h-48 overflow-y-auto rounded-xl bg-white dark:bg-slate-700
                      shadow-lg border border-slate-200 dark:border-slate-600 p-2 animate-fade-in`}
        >
          {EMOJI_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-2 last:mb-0">
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                {cat.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onSelect(emoji)}
                    className="w-8 h-8 flex items-center justify-center rounded-md
                               hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick reactions bar */}
      <div
        className="flex gap-1 px-2 py-1.5 bg-white dark:bg-slate-700 rounded-full
                   shadow-lg border border-slate-200 dark:border-slate-600 animate-fade-in"
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-lg"
          >
            {emoji}
          </button>
        ))}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-8 h-8 flex items-center justify-center rounded-full
                     hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-sm
                     text-slate-400 dark:text-slate-500"
          title={expanded ? 'Show less' : 'More emojis'}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>
    </div>
  );
}
