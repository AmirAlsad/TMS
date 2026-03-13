import { useState } from 'react';
import type { ReadReceiptMode } from '@tms/shared';
import { useStore } from '../stores/store';

export function ConfigPanel() {
  const botEndpoint = useStore((s) => s.botEndpoint);
  const setBotEndpoint = useStore((s) => s.setBotEndpoint);
  const mode = useStore((s) => s.mode);
  const readReceiptMode = useStore((s) => s.readReceiptMode);
  const setReadReceiptMode = useStore((s) => s.setReadReceiptMode);
  const channel = useStore((s) => s.channel);
  const [value, setValue] = useState(botEndpoint);
  const [autoDelayMs, setAutoDelayMs] = useState(2000);

  const save = async () => {
    setBotEndpoint(value);

    const configBody: Record<string, unknown> = {
      bot: { endpoint: value, method: 'POST' },
    };

    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configBody),
      });
    } catch (err) {
      console.error('Failed to update config:', err);
    }
  };

  const updateReadReceiptMode = async (newMode: ReadReceiptMode) => {
    setReadReceiptMode(newMode);
    try {
      await fetch('/api/whatsapp/read-receipt-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: newMode,
          autoDelayMs: newMode === 'auto_delay' ? autoDelayMs : undefined,
        }),
      });
    } catch (err) {
      console.error('Failed to update read receipt mode:', err);
    }
  };

  const updateAutoDelay = async (ms: number) => {
    setAutoDelayMs(ms);
    if (readReceiptMode === 'auto_delay') {
      try {
        await fetch('/api/whatsapp/read-receipt-mode', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'auto_delay', autoDelayMs: ms }),
        });
      } catch (err) {
        console.error('Failed to update auto delay:', err);
      }
    }
  };

  // Playground: on_response (automatic) or manual
  // Automated: on_response (automatic) or auto_delay
  const isPlayground = mode === 'playground';
  const readReceiptOptions: { value: ReadReceiptMode; label: string }[] = isPlayground
    ? [
        { value: 'on_response', label: 'Automatic' },
        { value: 'manual', label: 'Manual' },
      ]
    : [
        { value: 'on_response', label: 'Automatic' },
        { value: 'auto_delay', label: 'Auto delay' },
      ];

  return (
    <div
      className="border-b border-slate-200/60 dark:border-slate-700/40
                  bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm
                  px-5 py-3 animate-slide-down space-y-3"
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

      {channel === 'whatsapp' && (
        <div className="flex items-center gap-3 max-w-2xl">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
            Read receipts
          </label>
          <div className="flex gap-1">
            {readReceiptOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateReadReceiptMode(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  readReceiptMode === opt.value
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {readReceiptMode === 'auto_delay' && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={500}
                step={500}
                value={autoDelayMs}
                onChange={(e) => updateAutoDelay(Number(e.target.value))}
                className="w-20 rounded-lg px-2 py-1.5 text-sm font-mono
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100
                           border border-slate-200 dark:border-slate-600
                           focus:outline-none focus:ring-2 focus:ring-indigo-400/50
                           transition-shadow"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">ms</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
