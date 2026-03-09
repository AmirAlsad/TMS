import { useEffect, useState } from 'react';
import { useStore } from '../stores/store';
import type {
  EvalResult,
  Classification,
  TokenUsageSummary,
  TokenUsage,
  BotEndpointSummary,
  BatchRun,
} from '@tms/shared';

const classificationColors: Record<Classification, string> = {
  passed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
  needs_review: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  failed: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
};

const classificationLabels: Record<Classification, string> = {
  passed: 'Passed',
  needs_review: 'Needs Review',
  failed: 'Failed',
};

type ResultsView = 'all' | 'batches';

export function EvalResultsPanel() {
  const evalResults = useStore((s) => s.evalResults);
  const setEvalResults = useStore((s) => s.setEvalResults);
  const batchRuns = useStore((s) => s.batchRuns);
  const setBatchRuns = useStore((s) => s.setBatchRuns);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<ResultsView>('all');

  useEffect(() => {
    Promise.all([
      fetch('/api/eval')
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => setEvalResults(data.results ?? [])),
      fetch('/api/eval/batches')
        .then((res) => (res.ok ? res.json() : { runs: [] }))
        .then((data) => setBatchRuns(data.runs ?? [])),
    ]).catch(() => {});
  }, [setEvalResults, setBatchRuns]);

  const isEmpty = view === 'all' ? evalResults.length === 0 : batchRuns.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* View toggle */}
      <div className="flex border-b border-slate-200/60 dark:border-slate-700/40">
        {(['all', 'batches'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              view === v
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            {v === 'all' ? 'Individual' : 'Batches'}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="p-4">
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center mt-12">
            {view === 'all' ? 'No eval results yet' : 'No batch runs yet'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {view === 'all' &&
            evalResults.map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                expanded={expandedId === result.id}
                onToggle={() => setExpandedId(expandedId === result.id ? null : result.id)}
              />
            ))}
          {view === 'batches' &&
            batchRuns.map((run) => (
              <BatchRunCard
                key={run.id}
                run={run}
                results={evalResults}
                expanded={expandedId === run.id}
                onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function BatchRunCard({
  run,
  results,
  expanded,
  onToggle,
}: {
  run: BatchRun;
  results: EvalResult[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const specResults = run.specIds
    .map((id) => results.find((r) => r.id === id))
    .filter((r): r is EvalResult => r != null);

  const passed = specResults.filter((r) => r.classification === 'passed').length;
  const failed = specResults.filter((r) => r.classification === 'failed').length;
  const needsReview = specResults.filter((r) => r.classification === 'needs_review').length;

  const overallClassification: Classification | undefined =
    failed > 0 ? 'failed' : needsReview > 0 ? 'needs_review' : passed > 0 ? 'passed' : undefined;

  const time = run.completedAt
    ? new Date(run.completedAt).toLocaleString()
    : new Date(run.startedAt).toLocaleString();

  return (
    <div className="border-b border-slate-200/60 dark:border-slate-700/40">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left
                   hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {run.label}
            </span>
            {run.suiteName && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                suite
              </span>
            )}
          </div>
          {overallClassification && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${classificationColors[overallClassification]}`}
            >
              {classificationLabels[overallClassification]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          <span>{time}</span>
          <span>{run.specIds.length} specs</span>
          {specResults.length > 0 && (
            <>
              <span className="text-emerald-500">{passed} passed</span>
              {failed > 0 && <span className="text-red-500">{failed} failed</span>}
              {needsReview > 0 && <span className="text-amber-500">{needsReview} review</span>}
            </>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-1 animate-fade-in">
          {run.specIds.map((id, i) => {
            const result = results.find((r) => r.id === id);
            const specName = run.specNames[i] ?? id;
            return (
              <div
                key={id}
                className="flex items-center justify-between py-1.5 text-sm
                           border-b border-slate-100 dark:border-slate-800 last:border-0"
              >
                <span className="text-slate-700 dark:text-slate-300">{specName}</span>
                {result?.classification ? (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${classificationColors[result.classification]}`}
                  >
                    {classificationLabels[result.classification]}
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500">
                    {result?.status ?? 'pending'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
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
          {result.tokenUsage && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {result.tokenUsage.total.totalTokens.toLocaleString()} tokens
            </span>
          )}
          {result.tokenUsage?.botMetrics?.totalCost != null && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              ${result.tokenUsage.botMetrics.totalCost.toFixed(4)}
            </span>
          )}
          {result.batchId && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
              batch
            </span>
          )}
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
          {result.tokenUsage && <TokenUsageTable usage={result.tokenUsage} />}
          {result.tokenUsage?.botMetrics && (
            <BotMetricsSection metrics={result.tokenUsage.botMetrics} />
          )}
        </div>
      )}
    </div>
  );
}

function formatTokenCount(value: number): string {
  return value.toLocaleString();
}

function BotMetricsSection({ metrics }: { metrics: BotEndpointSummary }) {
  const items: Array<{ label: string; value: string }> = [];

  if (metrics.totalCost != null) {
    items.push({ label: 'Cost', value: `$${metrics.totalCost.toFixed(4)}` });
  }
  if (metrics.averageLatencyMs != null) {
    items.push({ label: 'Avg Latency', value: `${metrics.averageLatencyMs.toLocaleString()}ms` });
  }
  if (metrics.totalCachedTokens != null || metrics.totalUncachedTokens != null) {
    const cached = metrics.totalCachedTokens ?? 0;
    const uncached = metrics.totalUncachedTokens ?? 0;
    items.push({
      label: 'Prompt Tokens',
      value: `${cached.toLocaleString()} cached / ${uncached.toLocaleString()} uncached`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
        Bot Endpoint Metrics
      </p>
      <div className="space-y-1">
        {items.map(({ label, value }) => (
          <div key={label} className="flex justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenUsageTable({ usage }: { usage: TokenUsageSummary }) {
  const rows: Array<{ label: string; value: TokenUsage; bold?: boolean }> = [
    { label: 'User Bot', value: usage.userBot },
    { label: 'Judge', value: usage.judge },
    { label: 'Bot Endpoint', value: usage.botEndpoint },
    { label: 'Total', value: usage.total, bold: true },
  ];

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
        Token Usage
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-400 dark:text-slate-500">
            <th className="text-left font-medium pb-1">Source</th>
            <th className="text-right font-medium pb-1">Prompt</th>
            <th className="text-right font-medium pb-1">Completion</th>
            <th className="text-right font-medium pb-1">Total</th>
          </tr>
        </thead>
        <tbody className="text-slate-600 dark:text-slate-400">
          {rows.map(({ label, value, bold }) => (
            <tr
              key={label}
              className={
                bold ? 'font-semibold border-t border-slate-200/60 dark:border-slate-700/40' : ''
              }
            >
              <td className="py-0.5">{label}</td>
              <td className="text-right py-0.5">{formatTokenCount(value.promptTokens)}</td>
              <td className="text-right py-0.5">{formatTokenCount(value.completionTokens)}</td>
              <td className="text-right py-0.5">{formatTokenCount(value.totalTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
