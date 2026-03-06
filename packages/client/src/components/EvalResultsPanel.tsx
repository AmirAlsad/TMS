import { useEffect, useState } from 'react';
import { useStore } from '../stores/store';
import type { EvalResult, Classification } from '@tms/shared';

const classificationColors: Record<Classification, string> = {
  passed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
  needs_review:
    'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
};

const classificationLabels: Record<Classification, string> = {
  passed: 'Passed',
  needs_review: 'Needs Review',
  failed: 'Failed',
};

export function EvalResultsPanel() {
  const evalResults = useStore((s) => s.evalResults);
  const setEvalResults = useStore((s) => s.setEvalResults);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/eval')
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => setEvalResults(data.results ?? []))
      .catch(() => {});
  }, [setEvalResults]);

  if (evalResults.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center mt-12">
          No eval results yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {evalResults.map((result) => (
        <ResultCard
          key={result.id}
          result={result}
          expanded={expandedId === result.id}
          onToggle={() => setExpandedId(expandedId === result.id ? null : result.id)}
        />
      ))}
    </div>
  );
}

function ResultCard({
  result,
  expanded,
  onToggle,
}: {
  result: EvalResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const time = result.completedAt
    ? new Date(result.completedAt).toLocaleString()
    : new Date(result.startedAt).toLocaleString();

  return (
    <div className="border-b border-slate-200/60 dark:border-slate-700/40">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left
                   hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {result.specName}
          </span>
          {result.classification && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${classificationColors[result.classification]}`}
            >
              {classificationLabels[result.classification]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">{time}</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {result.transcript.length} message{result.transcript.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 animate-fade-in">
          {result.requirements.map((req, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {req.classification ? (
                <span
                  className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-md font-semibold ${classificationColors[req.classification]}`}
                >
                  {classificationLabels[req.classification]}
                </span>
              ) : (
                <span
                  className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-md font-semibold
                             bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                >
                  Pending
                </span>
              )}
              <div>
                <p className="text-slate-700 dark:text-slate-300">{req.description}</p>
                {req.reasoning && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {req.reasoning}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
