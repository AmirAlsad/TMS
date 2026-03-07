import { useEffect, useRef } from 'react';

const REACTIONS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}'];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 left-0 z-30 flex gap-1 px-2 py-1.5
                 bg-white dark:bg-slate-700 rounded-full shadow-lg border
                 border-slate-200 dark:border-slate-600 animate-fade-in"
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center rounded-full
                     hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-lg"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
