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
        <h2 className="text-sm font-medium text-gray-700">Eval Runner</h2>
        <button
          onClick={refreshSpecs}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          Refresh specs
        </button>
      </div>

      {evalSpecs.length === 0 ? (
        <p className="text-sm text-gray-400">
          No eval specs found. Add YAML specs to the evals/ directory.
        </p>
      ) : (
        <div className="space-y-3">
          <select
            value={selectedSpec}
            onChange={(e) => setSelectedSpec(e.target.value)}
            disabled={isRunning}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
              className="w-full bg-red-500 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-600"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={runEval}
              disabled={!selectedSpec || loading}
              className="w-full bg-blue-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-blue-600"
            >
              {loading ? 'Starting...' : 'Run Eval'}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {currentEval && (
        <div className="border rounded p-3 bg-gray-50 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{currentEval.specName}</span>
            <StatusBadge status={currentEval.status} />
          </div>
          {currentEval.totalTurns > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  Turn {currentEval.currentTurn} / {currentEval.totalTurns}
                </span>
                <span>
                  {Math.round((currentEval.currentTurn / currentEval.totalTurns) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
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
  const styles = {
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status as keyof typeof styles] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {status}
    </span>
  );
}
