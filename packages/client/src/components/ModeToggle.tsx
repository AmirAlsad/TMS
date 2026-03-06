import { useStore } from '../stores/store';
import type { AppMode } from '../stores/store';

export function ModeToggle() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const setEvalSpecs = useStore((s) => s.setEvalSpecs);

  const handleToggle = async (newMode: AppMode) => {
    setMode(newMode);
    if (newMode === 'automated') {
      try {
        const res = await fetch('/api/eval/specs');
        if (res.ok) {
          const data = await res.json();
          setEvalSpecs(data.specs ?? []);
        }
      } catch {
        // Server may not have eval routes yet
      }
    }
  };

  return (
    <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
      <button
        onClick={() => handleToggle('playground')}
        className={`px-3 py-1.5 rounded-[10px] transition-all ${
          mode === 'playground'
            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        Playground
      </button>
      <button
        onClick={() => handleToggle('automated')}
        className={`px-3 py-1.5 rounded-[10px] transition-all ${
          mode === 'automated'
            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        Automated
      </button>
    </div>
  );
}
