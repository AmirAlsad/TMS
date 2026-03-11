import { useEffect } from 'react';
import { useStore } from '../stores/store';
import type { SpecHistory } from '@tms/shared';

const trendArrows: Record<string, string> = {
  improving: '\u2191',
  stable: '\u2192',
  declining: '\u2193',
};

const trendColors: Record<string, string> = {
  improving: 'text-emerald-500',
  stable: 'text-slate-400',
  declining: 'text-red-500',
};

export function HistoryPanel() {
  const specHistories = useStore((s) => s.specHistories);
  const setSpecHistories = useStore((s) => s.setSpecHistories);

  useEffect(() => {
    fetch('/api/eval/history')
      .then((res) => (res.ok ? res.json() : { histories: [] }))
      .then((data) => setSpecHistories(data.histories ?? []))
      .catch(() => {});
  }, [setSpecHistories]);

  if (specHistories.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center mt-12">
          No eval history yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200/60 dark:border-slate-700/40">
            <th className="text-left font-medium px-3 py-2">Spec</th>
            <th className="text-right font-medium px-2 py-2">Runs</th>
            <th className="text-right font-medium px-2 py-2">Pass Rate</th>
            <th className="text-right font-medium px-2 py-2">Recent</th>
            <th className="text-center font-medium px-2 py-2">Trend</th>
          </tr>
        </thead>
        <tbody>
          {specHistories.map((h) => (
            <HistoryRow key={h.specName} history={h} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryRow({ history }: { history: SpecHistory }) {
  const regressionBorder = history.regression
    ? 'border-l-2 border-l-red-500'
    : '';

  return (
    <tr
      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${regressionBorder}`}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {history.specName}
          </span>
          {history.regression && (
            <span className="text-[10px] px-1 py-0.5 rounded font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              REGRESSION
            </span>
          )}
        </div>
        {/* Mini timeline */}
        <div className="flex gap-0.5 mt-1">
          {history.results.slice(-15).map((r) => (
            <div
              key={r.id}
              className={`w-2 h-2 rounded-full ${
                r.classification === 'passed'
                  ? 'bg-emerald-500'
                  : r.classification === 'failed'
                    ? 'bg-red-500'
                    : r.classification === 'needs_review'
                      ? 'bg-amber-500'
                      : 'bg-slate-300 dark:bg-slate-600'
              }`}
              title={`${r.classification ?? 'unknown'} - ${r.completedAt ? new Date(r.completedAt).toLocaleDateString() : ''}`}
            />
          ))}
        </div>
      </td>
      <td className="text-right px-2 py-2 text-slate-600 dark:text-slate-400">
        {history.results.length}
      </td>
      <td className="text-right px-2 py-2 font-semibold text-slate-700 dark:text-slate-300">
        {Math.round(history.passRate * 100)}%
      </td>
      <td className="text-right px-2 py-2 font-semibold text-slate-700 dark:text-slate-300">
        {Math.round(history.recentPassRate * 100)}%
      </td>
      <td className={`text-center px-2 py-2 font-bold text-lg ${trendColors[history.trend]}`}>
        {trendArrows[history.trend]}
      </td>
    </tr>
  );
}
