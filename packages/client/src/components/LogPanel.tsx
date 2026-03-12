import { useRef, useEffect, useState } from 'react';
import { useStore } from '../stores/store';
import type { LogLevel } from '@tms/shared';

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

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const DEFAULT_LEVELS = new Set<LogLevel>(['info', 'warn', 'error']);

function LevelToggle({
  level,
  active,
  onToggle,
}: {
  level: LogLevel;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase transition-colors
        ${
          active
            ? `${levelColors[level]} bg-slate-100 dark:bg-slate-800`
            : 'text-slate-300 dark:text-slate-700'
        }`}
    >
      {level}
    </button>
  );
}

function ExpandableData({
  data,
  expanded,
  onToggle,
}: {
  data: Record<string, unknown>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className="shrink-0 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
        title={expanded ? 'Collapse data' : 'Expand data'}
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {expanded && (
        <pre className="col-span-full ml-6 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded px-2.5 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </>
  );
}

function LogEntry({ log }: { log: { timestamp: string; level: string; source: string; message: string; data?: Record<string, unknown> } }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(log.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className="flex flex-wrap items-start gap-x-2 gap-y-0 py-1 px-2 rounded-md
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
      {log.data && (
        <ExpandableData data={log.data} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      )}
    </div>
  );
}

export function LogPanel() {
  const logs = useStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(new Set(DEFAULT_LEVELS));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const toggleLevel = (level: LogLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  // Extract unique sources
  const allSources = [...new Set(logs.map((l) => l.source))].sort();

  const toggleSource = (source: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const filteredLogs = logs.filter((l) => {
    if (!activeLevels.has(l.level)) return false;
    if (activeSources.size > 0 && !activeSources.has(l.source)) return false;
    if (searchQuery && !l.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tms-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/40 space-y-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Logs
          </h2>
          <div className="ml-auto flex items-center gap-1">
            {ALL_LEVELS.map((level) => (
              <LevelToggle key={level} level={level} active={activeLevels.has(level)} onToggle={() => toggleLevel(level)} />
            ))}
            <button
              onClick={exportLogs}
              disabled={filteredLogs.length === 0}
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-400 dark:text-slate-500
                         hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800
                         disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Export filtered logs as JSON"
            >
              Export
            </button>
          </div>
        </div>

        {/* Search input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search logs..."
          className="w-full rounded-md px-2.5 py-1 text-[11px] font-mono
                     bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300
                     border border-slate-200 dark:border-slate-700
                     placeholder:text-slate-400 dark:placeholder:text-slate-600
                     focus:outline-none focus:ring-1 focus:ring-indigo-400/50"
        />

        {/* Source filter chips */}
        {allSources.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {allSources.map((source) => (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors
                  ${
                    activeSources.size === 0 || activeSources.has(source)
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                  }`}
              >
                {source}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-[11px] scrollbar-thin">
        {filteredLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-16 gap-3">
            <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            <div className="text-center font-sans">
              <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
                {logs.length > 0 ? 'No logs match filters' : 'No logs yet'}
              </p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                {logs.length > 0 ? 'Try adjusting your search or filters' : 'Logs from your bot endpoint will appear here'}
              </p>
            </div>
          </div>
        )}
        {filteredLogs.map((log, i) => (
          <LogEntry key={i} log={log} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
