import { useState } from 'react';
import { useStore } from '../stores/store';

export function ConfigPanel() {
  const botEndpoint = useStore((s) => s.botEndpoint);
  const setBotEndpoint = useStore((s) => s.setBotEndpoint);
  const [value, setValue] = useState(botEndpoint);

  const save = async () => {
    setBotEndpoint(value);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot: { endpoint: value, method: 'POST' } }),
      });
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  return (
    <div
      className="border-b border-slate-200/60 dark:border-slate-700/40
                  bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm
                  px-5 py-3 animate-slide-down"
    >
      <div className="flex items-center gap-3 max-w-2xl">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
          Bot endpoint
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg px-3 py-1.5 text-sm font-mono
                     bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
                     border border-slate-200 dark:border-slate-600
                     focus:outline-none focus:ring-2 focus:ring-indigo-400/50
                     transition-shadow"
        />
        <button
          onClick={save}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold
                     bg-indigo-500 hover:bg-indigo-600 text-white
                     transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
