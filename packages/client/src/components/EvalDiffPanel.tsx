import { useState } from 'react';
import type { EvalDiffResult } from '@tms/shared';

/**
 * Side-by-side eval result comparison view (Tier 6.3).
 *
 * Fetches a diff from POST /api/eval/diff and displays:
 * - Classification change
 * - Transcript divergence point
 * - Requirement classification changes
 * - Token usage and cost deltas
 */
export function EvalDiffPanel() {
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [diff, setDiff] = useState<EvalDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runDiff = async () => {
    if (!idA.trim() || !idB.trim()) return;
    setLoading(true);
    setError(null);
    setDiff(null);

    try {
      const res = await fetch('/api/eval/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idA: idA.trim(), idB: idB.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? `Request failed with status ${res.status}`);
        return;
      }

      setDiff(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Eval Diff</h3>

      <div className="flex gap-2">
        <input
          value={idA}
          onChange={(e) => setIdA(e.target.value)}
          placeholder="Result A ID"
          className="flex-1 text-xs px-2.5 py-1.5 rounded border border-slate-300
                     dark:border-slate-600 bg-white dark:bg-slate-800
                     text-slate-900 dark:text-white placeholder:text-slate-400"
        />
        <input
          value={idB}
          onChange={(e) => setIdB(e.target.value)}
          placeholder="Result B ID"
          className="flex-1 text-xs px-2.5 py-1.5 rounded border border-slate-300
                     dark:border-slate-600 bg-white dark:bg-slate-800
                     text-slate-900 dark:text-white placeholder:text-slate-400"
        />
        <button
          onClick={runDiff}
          disabled={loading || !idA.trim() || !idB.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded bg-indigo-500
                     hover:bg-indigo-600 disabled:opacity-50 text-white transition-colors"
        >
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      {diff && (
        <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
          {/* Overview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
              <p className="font-medium">A: {diff.specNameA}</p>
              <p className="text-[11px] text-slate-500">{diff.idA}</p>
              <ClassificationBadge classification={diff.classificationA} />
              <p className="text-[11px]">{diff.transcriptLengthA} messages</p>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
              <p className="font-medium">B: {diff.specNameB}</p>
              <p className="text-[11px] text-slate-500">{diff.idB}</p>
              <ClassificationBadge classification={diff.classificationB} />
              <p className="text-[11px]">{diff.transcriptLengthB} messages</p>
            </div>
          </div>

          {/* Divergence */}
          {diff.divergencePoint >= 0 ? (
            <p className="text-amber-600 dark:text-amber-400">
              Transcripts diverged at message index {diff.divergencePoint}
              (turn {Math.ceil((diff.divergencePoint + 1) / 2)})
            </p>
          ) : (
            <p className="text-green-600 dark:text-green-400">Transcript content is identical</p>
          )}

          {/* Requirement diffs */}
          <div>
            <p className="font-medium mb-1">Requirements:</p>
            <div className="space-y-1">
              {diff.requirementDiffs.map((req, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-1.5 rounded ${
                    req.changed
                      ? 'bg-amber-50 dark:bg-amber-900/20'
                      : 'bg-slate-50/50 dark:bg-slate-800/50'
                  }`}
                >
                  <span className="shrink-0">
                    {req.changed ? (
                      <span className="text-amber-500">~</span>
                    ) : (
                      <span className="text-slate-400">=</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{req.description}</p>
                    {req.changed && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {req.classificationA ?? 'N/A'} -&gt; {req.classificationB ?? 'N/A'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Token usage delta */}
          {diff.tokenUsageDelta && (
            <div>
              <p className="font-medium mb-1">Token Usage Delta (B - A):</p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <DeltaCell label="Prompt" value={diff.tokenUsageDelta.promptTokens} />
                <DeltaCell label="Completion" value={diff.tokenUsageDelta.completionTokens} />
                <DeltaCell label="Total" value={diff.tokenUsageDelta.totalTokens} />
              </div>
            </div>
          )}

          {diff.costDelta != null && (
            <p className={diff.costDelta > 0 ? 'text-red-500' : 'text-green-500'}>
              Cost delta: {diff.costDelta > 0 ? '+' : ''}${diff.costDelta.toFixed(4)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ClassificationBadge({ classification }: { classification?: string }) {
  if (!classification) return <span className="text-[11px] text-slate-400">N/A</span>;

  const colors: Record<string, string> = {
    passed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    needs_review: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  };

  return (
    <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded ${colors[classification] ?? ''}`}>
      {classification}
    </span>
  );
}

function DeltaCell({ label, value }: { label: string; value: number }) {
  const color = value > 0 ? 'text-red-500' : value < 0 ? 'text-green-500' : 'text-slate-400';
  return (
    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800">
      <p className="text-slate-500">{label}</p>
      <p className={`font-mono ${color}`}>
        {value > 0 ? '+' : ''}{value.toLocaleString()}
      </p>
    </div>
  );
}
