import { useStore } from '../stores/store';

export function EvalStatusBar() {
  const currentEval = useStore((s) => s.currentEval);
  const clearEval = useStore((s) => s.clearEval);

  if (!currentEval || currentEval.status !== 'running') return null;

  const progress =
    currentEval.totalTurns > 0
      ? Math.round((currentEval.currentTurn / currentEval.totalTurns) * 100)
      : 0;

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center gap-3 text-sm">
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      <span className="font-medium text-blue-800">{currentEval.specName}</span>
      {currentEval.totalTurns > 0 && (
        <span className="text-blue-600">
          Turn {currentEval.currentTurn}/{currentEval.totalTurns} ({progress}%)
        </span>
      )}
      <button
        onClick={clearEval}
        className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium"
      >
        Stop
      </button>
    </div>
  );
}
