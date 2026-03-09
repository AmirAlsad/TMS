import { useStore } from '../stores/store';
import { StatusBadge } from './EvalPanel';
import type { Classification } from '@tms/shared';

const classificationColors: Record<Classification, string> = {
  passed: 'text-emerald-600 dark:text-emerald-400',
  needs_review: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
};

export function BatchProgressPanel() {
  const activeBatchRun = useStore((s) => s.activeBatchRun);
  const evalResults = useStore((s) => s.evalResults);
  const clearBatchRun = useStore((s) => s.clearBatchRun);

  if (!activeBatchRun) return null;

  const { specIds, specNames, label } = activeBatchRun;
  const resultMap = new Map(evalResults.map((r) => [r.id, r]));

  const completedCount = specIds.filter((id) => {
    const r = resultMap.get(id);
    return r && r.status !== 'running';
  }).length;

  const progress = specIds.length > 0 ? (completedCount / specIds.length) * 100 : 0;
  const isRunning = activeBatchRun.status === 'running';

  return (
    <div className="border-t border-slate-200/60 dark:border-slate-700/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </h3>
          <StatusBadge status={activeBatchRun.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {completedCount}/{specIds.length}
          </span>
          {!isRunning && (
            <button
              onClick={clearBatchRun}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600
                         dark:hover:text-slate-300 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Per-spec status */}
      <div className="space-y-1">
        {specIds.map((id, i) => {
          const result = resultMap.get(id);
          const specName = specNames[i] ?? id;

          return (
            <div key={id} className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-700 dark:text-slate-300 truncate mr-2">
                {specName}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {result?.classification && (
                  <span
                    className={`text-[11px] font-medium ${classificationColors[result.classification]}`}
                  >
                    {result.classification === 'needs_review' ? 'Review' : result.classification}
                  </span>
                )}
                <StatusBadge status={result?.status ?? 'pending'} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
