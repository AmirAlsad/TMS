import { useEffect, useState } from 'react';
import { useStore } from '../stores/store';
import type { EvalResult, Classification } from '@tms/shared';

const classificationColors: Record<Classification, string> = {
  passed: 'text-green-600 bg-green-50',
  needs_review: 'text-yellow-600 bg-yellow-50',
  failed: 'text-red-600 bg-red-50',
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
        <p className="text-sm text-gray-400 text-center mt-8">No eval results yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
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
    <div className="border-b">
      <button onClick={onToggle} className="w-full px-4 py-3 text-left hover:bg-gray-50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{result.specName}</span>
          {result.classification && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${classificationColors[result.classification]}`}
            >
              {classificationLabels[result.classification]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{time}</span>
          <span className="text-xs text-gray-400">
            {result.transcript.length} message{result.transcript.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {result.requirements.map((req, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {req.classification ? (
                <span
                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${classificationColors[req.classification]}`}
                >
                  {classificationLabels[req.classification]}
                </span>
              ) : (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                  Pending
                </span>
              )}
              <div>
                <p className="text-gray-700">{req.description}</p>
                {req.reasoning && <p className="text-xs text-gray-400 mt-0.5">{req.reasoning}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
