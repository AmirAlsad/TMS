import { useState, useEffect } from 'react';
import { useStore } from '../stores/store';
import type { EvalSuite } from '@tms/shared';
import { BatchProgressPanel } from './BatchProgressPanel';

type RunMode = 'suite' | 'batch' | 'single';

export function EvalPanel() {
  const evalSpecs = useStore((s) => s.evalSpecs);
  const evalSuites = useStore((s) => s.evalSuites);
  const currentEval = useStore((s) => s.currentEval);
  const activeBatchRun = useStore((s) => s.activeBatchRun);
  const startEval = useStore((s) => s.startEval);
  const clearEval = useStore((s) => s.clearEval);
  const setEvalSpecs = useStore((s) => s.setEvalSpecs);
  const setEvalSuites = useStore((s) => s.setEvalSuites);

  const [runMode, setRunMode] = useState<RunMode>('suite');
  const [selectedSuite, setSelectedSuite] = useState('');
  const [suiteDetail, setSuiteDetail] = useState<EvalSuite | null>(null);
  const [selectedSpecs, setSelectedSpecs] = useState<Set<string>>(new Set());
  const [selectedSpec, setSelectedSpec] = useState('');
  const [parallel, setParallel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRunning = currentEval?.status === 'running' || activeBatchRun?.status === 'running';

  const refreshData = async () => {
    try {
      const [specsRes, suitesRes] = await Promise.all([
        fetch('/api/eval/specs'),
        fetch('/api/eval/suites'),
      ]);
      if (specsRes.ok) {
        const data = await specsRes.json();
        setEvalSpecs(data.specs ?? []);
      }
      if (suitesRes.ok) {
        const data = await suitesRes.json();
        setEvalSuites(data.suites ?? []);
      }
    } catch {
      // Server may not be ready
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (!selectedSuite) {
      setSuiteDetail(null);
      return;
    }
    fetch(`/api/eval/suites/${selectedSuite}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSuiteDetail(data as EvalSuite | null))
      .catch(() => setSuiteDetail(null));
  }, [selectedSuite]);

  const runSuite = async () => {
    if (!selectedSuite) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/eval/suite/${selectedSuite}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parallel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Server returned ${res.status}`);
      }
    } catch (err) {
      setError('Failed to start suite');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runBatch = async () => {
    if (selectedSpecs.size === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/eval/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specs: [...selectedSpecs], parallel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Server returned ${res.status}`);
      }
    } catch (err) {
      setError('Failed to start batch');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runSingle = async () => {
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

  const toggleSpec = (spec: string) => {
    setSelectedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(spec)) next.delete(spec);
      else next.add(spec);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Eval Runner
          </h2>
          <button
            onClick={refreshData}
            className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400
                       hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
          {(['suite', 'batch', 'single'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setRunMode(mode)}
              className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors capitalize ${
                runMode === mode
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Suite mode */}
        {runMode === 'suite' && (
          <div className="space-y-3">
            {evalSuites.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No suites found. Add YAML files to evals/suites/.
              </p>
            ) : (
              <>
                <select
                  value={selectedSuite}
                  onChange={(e) => setSelectedSuite(e.target.value)}
                  disabled={isRunning}
                  className="w-full rounded-lg px-3 py-2 text-sm
                             bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100
                             border border-slate-200 dark:border-slate-700
                             focus:outline-none focus:ring-2 focus:ring-indigo-400/50
                             disabled:opacity-50 cursor-pointer transition-shadow"
                >
                  <option value="">Select a suite...</option>
                  {evalSuites.map((suite) => (
                    <option key={suite} value={suite}>
                      {suite}
                    </option>
                  ))}
                </select>

                {suiteDetail && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/40 p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      {suiteDetail.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {suiteDetail.specs.map((spec) => (
                        <span
                          key={spec}
                          className="text-[11px] px-2 py-0.5 rounded-full font-medium
                                     bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <ParallelToggle
                  parallel={parallel}
                  setParallel={setParallel}
                  disabled={isRunning}
                />

                <button
                  onClick={runSuite}
                  disabled={!selectedSuite || isRunning || loading}
                  className="w-full rounded-lg px-4 py-2 text-sm font-semibold
                             bg-indigo-500 hover:bg-indigo-600 text-white
                             disabled:opacity-40 disabled:hover:bg-indigo-500
                             transition-colors"
                >
                  {loading ? 'Starting...' : 'Run Suite'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Batch mode */}
        {runMode === 'batch' && (
          <div className="space-y-3">
            {evalSpecs.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No eval specs found. Add YAML specs to the evals/ directory.
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto scrollbar-thin">
                  {evalSpecs.map((spec) => (
                    <label
                      key={spec}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer
                                 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors
                                 border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSpecs.has(spec)}
                        onChange={() => toggleSpec(spec)}
                        disabled={isRunning}
                        className="rounded border-slate-300 dark:border-slate-600
                                   text-indigo-500 focus:ring-indigo-400/50"
                      />
                      <span className="text-slate-700 dark:text-slate-300">{spec}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                  <span>{selectedSpecs.size} selected</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedSpecs(new Set(evalSpecs))}
                      className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelectedSpecs(new Set())}
                      className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <ParallelToggle
                  parallel={parallel}
                  setParallel={setParallel}
                  disabled={isRunning}
                />

                <button
                  onClick={runBatch}
                  disabled={selectedSpecs.size === 0 || isRunning || loading}
                  className="w-full rounded-lg px-4 py-2 text-sm font-semibold
                             bg-indigo-500 hover:bg-indigo-600 text-white
                             disabled:opacity-40 disabled:hover:bg-indigo-500
                             transition-colors"
                >
                  {loading
                    ? 'Starting...'
                    : `Run ${selectedSpecs.size} Spec${selectedSpecs.size !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {/* Single mode */}
        {runMode === 'single' && (
          <div className="space-y-3">
            {evalSpecs.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No eval specs found. Add YAML specs to the evals/ directory.
              </p>
            ) : (
              <>
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
                    onClick={runSingle}
                    disabled={!selectedSpec || loading}
                    className="w-full rounded-lg px-4 py-2 text-sm font-semibold
                               bg-indigo-500 hover:bg-indigo-600 text-white
                               disabled:opacity-40 disabled:hover:bg-indigo-500
                               transition-colors"
                  >
                    {loading ? 'Starting...' : 'Run Eval'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        {/* Single eval progress */}
        {currentEval && !activeBatchRun && (
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

      {/* Batch progress */}
      <BatchProgressPanel />
    </div>
  );
}

function ParallelToggle({
  parallel,
  setParallel,
  disabled,
}: {
  parallel: boolean;
  setParallel: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={parallel}
        onChange={(e) => setParallel(e.target.checked)}
        disabled={disabled}
        className="rounded border-slate-300 dark:border-slate-600
                   text-indigo-500 focus:ring-indigo-400/50"
      />
      <span className="text-slate-600 dark:text-slate-400">Run in parallel</span>
    </label>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
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
