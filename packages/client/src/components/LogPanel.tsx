import { useRef, useEffect } from 'react';
import { useStore } from '../stores/store';

const levelColors: Record<string, string> = {
  debug: 'text-slate-400 dark:text-slate-500',
  info: 'text-indigo-500 dark:text-indigo-400',
  warn: 'text-amber-500 dark:text-amber-400',
  error: 'text-red-500 dark:text-red-400',
};

const levelDots: Record<string, string> = {
  debug: 'bg-slate-300 dark:bg-slate-600',
  info: 'bg-indigo-400 dark:bg-indigo-500',
  warn: 'bg-amber-400 dark:bg-amber-500',
  error: 'bg-red-400 dark:bg-red-500',
};

export function LogPanel() {
  const logs = useStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/40">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-slate-400 dark:text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Logs
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-[11px] scrollbar-thin">
        {logs.length === 0 && (
          <p className="text-slate-400 dark:text-slate-600 text-center mt-12 font-sans text-sm">
            No logs yet
          </p>
        )}
        {logs.map((log, i) => {
          const time = new Date(log.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          return (
            <div
              key={i}
              className="flex items-start gap-2 py-1 px-2 rounded-md
                         hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${levelDots[log.level] ?? 'bg-slate-400'}`}
              />
              <span className="text-slate-400 dark:text-slate-600 shrink-0">{time}</span>
              <span
                className={`shrink-0 uppercase font-semibold ${levelColors[log.level] ?? 'text-slate-500'}`}
              >
                {log.level}
              </span>
              <span className="text-slate-400 dark:text-slate-600 shrink-0">[{log.source}]</span>
              <span className="text-slate-700 dark:text-slate-300">{log.message}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
