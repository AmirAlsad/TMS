import { useStore } from '../stores/store';

export function EvalStatusBar() {
  const currentEval = useStore((s) => s.currentEval);
  const clearEval = useStore((s) => s.clearEval);
  const activeBatchRun = useStore((s) => s.activeBatchRun);
  const evalResults = useStore((s) => s.evalResults);
  const clearBatchRun = useStore((s) => s.clearBatchRun);

  // Batch run status bar
  if (activeBatchRun) {
    const completedCount = activeBatchRun.specIds.filter((id) =>
      evalResults.some((r) => r.id === id && r.status !== 'running'),
    ).length;
    const total = activeBatchRun.specIds.length;

    return (
      <div
        className="bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-800/40
                    px-5 py-1.5 flex items-center gap-3 text-sm animate-slide-down"
      >
        {activeBatchRun.status === 'running' ? (
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        ) : (
          <div
            className={`w-2 h-2 rounded-full ${activeBatchRun.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
        )}
        <span className="font-semibold text-indigo-700 dark:text-indigo-300">
          {activeBatchRun.label}
        </span>
        <span className="text-indigo-500 dark:text-indigo-400 text-xs">
          {completedCount}/{total} specs complete
        </span>
        <button
          onClick={clearBatchRun}
          className="ml-auto text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300
                     font-semibold transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Single eval status bar (existing behavior)
  if (!currentEval || currentEval.status !== 'running') return null;

  const progress =
    currentEval.totalTurns > 0
      ? Math.round((currentEval.currentTurn / currentEval.totalTurns) * 100)
      : 0;

  return (
    <div
      className="bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-800/40
                  px-5 py-1.5 flex items-center gap-3 text-sm animate-slide-down"
    >
      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
      <span className="font-semibold text-indigo-700 dark:text-indigo-300">
        {currentEval.specName}
      </span>
      {currentEval.totalTurns > 0 && (
        <span className="text-indigo-500 dark:text-indigo-400 text-xs">
          Turn {currentEval.currentTurn}/{currentEval.totalTurns} ({progress}%)
        </span>
      )}
      <button
        onClick={clearEval}
        className="ml-auto text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300
                   font-semibold transition-colors"
      >
        Stop
      </button>
    </div>
  );
}
