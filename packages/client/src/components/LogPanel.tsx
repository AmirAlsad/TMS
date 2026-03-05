import { useRef, useEffect } from 'react';
import { useStore } from '../stores/store';

const levelColors: Record<string, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-600',
  warn: 'text-yellow-600',
  error: 'text-red-600',
};

export function LogPanel() {
  const logs = useStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-2 bg-gray-50">
        <h2 className="text-sm font-medium text-gray-700">Logs</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs">
        {logs.length === 0 && (
          <p className="text-gray-400 text-center mt-8">No logs yet</p>
        )}
        {logs.map((log, i) => {
          const time = new Date(log.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          return (
            <div key={i} className="flex gap-2">
              <span className="text-gray-400 shrink-0">{time}</span>
              <span className={`shrink-0 uppercase font-bold ${levelColors[log.level] ?? 'text-gray-600'}`}>
                {log.level}
              </span>
              <span className="text-gray-500 shrink-0">[{log.source}]</span>
              <span className="text-gray-800">{log.message}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
