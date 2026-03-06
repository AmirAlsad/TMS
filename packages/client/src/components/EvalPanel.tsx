import { useState } from 'react';
import { useStore } from '../stores/store';

export function EvalPanel() {
  const evalSpecs = useStore((s) => s.evalSpecs);
  const currentEval = useStore((s) => s.currentEval);
  const startEval = useStore((s) => s.startEval);
  const clearEval = useStore((s) => s.clearEval);
  const setEvalSpecs = useStore((s) => s.setEvalSpecs);
  const [selectedSpec, setSelectedSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshSpecs = async () => {
    try {
      const res = await fetch('/api/eval/specs');
      if (res.ok) {
        const data = await res.json();
        setEvalSpecs(data.specs ?? []);
      }
    } catch {
      // Server may not have eval routes yet
    }
  };

  const runEval = async () => {
    if (!selectedSpec) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/eval/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: selectedSpec }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      const data = await res.json();
      startEval({
        id: data.id,
        specName: selectedSpec,
        status: 'running',
        currentTurn: 0,
        totalTurns: 0,
      });
    } catch (err) {
      setError('Failed to start eval');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isRunning = currentEval?.status === 'running';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Eval Runner
        </h2>
        <button
          onClick={refreshSpecs}
          className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400
                     hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          Refresh specs
        </button>
      </div>

      {evalSpecs.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No eval specs found. Add YAML specs to the evals/ directory.
        </p>
      ) : (
        <div className="space-y-3">
          <select
            value={selectedSpec}
            onChange={(e) => setSelectedSpec(e.target.value)}
            disabled={isRunning}
            className="w-full rounded-lg px-3 py-2 text-sm
                       bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100
                       border border-slate-200 dark:border-slate-700
                       focus:outline-none focus:ring-2 focus:ring-indigo-400/50
                       disabled:opacity-50 cursor-pointer transition-shadow"
          >
            <option value="">Select a spec...</option>
            {evalSpecs.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>

          {isRunning ? (
            <button
              onClick={clearEval}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold
                         bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={runEval}
              disabled={!selectedSpec || loading}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold
                         bg-indigo-500 hover:bg-indigo-600 text-white
                         disabled:opacity-40 disabled:hover:bg-indigo-500
                         transition-colors"
            >
              {loading ? 'Starting...' : 'Run Eval'}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      {currentEval && (
        <div
          className="rounded-xl p-3.5 space-y-2
                      bg-slate-50 dark:bg-slate-800
                      border border-slate-200/60 dark:border-slate-700/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {currentEval.specName}
            </span>
            <StatusBadge status={currentEval.status} />
          </div>
          {currentEval.totalTurns > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Turn {currentEval.currentTurn} / {currentEval.totalTurns}
                </span>
                <span>
                  {Math.round((currentEval.currentTurn / currentEval.totalTurns) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${(currentEval.currentTurn / currentEval.totalTurns) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
    completed: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    failed: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
  };
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${styles[status] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}
    >
      {status}
    </span>
  );
}
