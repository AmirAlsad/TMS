import fs from 'node:fs/promises';
import path from 'node:path';
import type { SpecHistory, Trend, Classification } from '@tms/shared';
import { listEvalResults } from './eval-results.js';
import { findProjectRoot } from './project-root.js';

const RESULTS_DIR = path.resolve(findProjectRoot(), 'eval-results');
const BASELINES_PATH = path.join(RESULTS_DIR, 'baselines.json');

async function loadBaselines(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(BASELINES_PATH, 'utf-8');
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

async function saveBaselines(baselines: Record<string, string>): Promise<void> {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  await fs.writeFile(BASELINES_PATH, JSON.stringify(baselines, null, 2), 'utf-8');
}

export async function setBaseline(specName: string, evalId: string): Promise<void> {
  const baselines = await loadBaselines();
  baselines[specName] = evalId;
  await saveBaselines(baselines);
}

export async function getBaseline(specName: string): Promise<string | null> {
  const baselines = await loadBaselines();
  return baselines[specName] ?? null;
}

export async function getAllBaselines(): Promise<Record<string, string>> {
  return loadBaselines();
}

export async function getSpecHistory(specName: string, window = 5): Promise<SpecHistory> {
  const allResults = await listEvalResults();
  const baselines = await loadBaselines();
  const specResults = allResults
    .filter((r) => r.specName === specName && r.status === 'completed')
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const results = specResults.map((r) => ({
    id: r.id,
    classification: r.classification,
    completedAt: r.completedAt,
  }));

  const total = results.length;
  const passed = results.filter((r) => r.classification === 'passed').length;
  const passRate = total > 0 ? passed / total : 0;

  // Recent window
  const recentResults = results.slice(-window);
  const recentPassed = recentResults.filter((r) => r.classification === 'passed').length;
  const recentPassRate = recentResults.length > 0 ? recentPassed / recentResults.length : 0;

  // Previous window (the window before recent)
  const previousResults = results.slice(-window * 2, -window);
  const previousPassed = previousResults.filter((r) => r.classification === 'passed').length;
  const previousPassRate = previousResults.length > 0 ? previousPassed / previousResults.length : 0;

  // Regression heuristic
  let regression = detectRegression(recentPassRate, previousPassRate);

  // Enhanced regression detection: also compare against baseline
  const baselineId = baselines[specName];
  if (baselineId && !regression) {
    const baselineResult = allResults.find((r) => r.id === baselineId);
    if (baselineResult?.classification === 'passed' && recentPassRate < 0.8) {
      regression = true;
    }
  }

  // Trend
  const trend = computeTrend(recentPassRate, previousPassRate);

  return {
    specName,
    results,
    passRate,
    recentPassRate,
    previousPassRate,
    regression,
    trend,
  };
}

export async function getAllSpecHistories(window = 5): Promise<SpecHistory[]> {
  const allResults = await listEvalResults();
  const baselines = await loadBaselines();
  const specNames = [...new Set(allResults.map((r) => r.specName))];

  const histories: SpecHistory[] = [];
  for (const name of specNames) {
    const specResults = allResults
      .filter((r) => r.specName === name && r.status === 'completed')
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    if (specResults.length === 0) continue;

    const results = specResults.map((r) => ({
      id: r.id,
      classification: r.classification as Classification | undefined,
      completedAt: r.completedAt,
    }));

    const total = results.length;
    const passed = results.filter((r) => r.classification === 'passed').length;
    const passRate = total > 0 ? passed / total : 0;

    const recentResults = results.slice(-window);
    const recentPassed = recentResults.filter((r) => r.classification === 'passed').length;
    const recentPassRate = recentResults.length > 0 ? recentPassed / recentResults.length : 0;

    const previousResults = results.slice(-window * 2, -window);
    const previousPassed = previousResults.filter((r) => r.classification === 'passed').length;
    const previousPassRate =
      previousResults.length > 0 ? previousPassed / previousResults.length : 0;

    let regression = detectRegression(recentPassRate, previousPassRate);

    // Enhanced regression detection: also compare against baseline
    const baselineId = baselines[name];
    if (baselineId && !regression) {
      const baselineResult = allResults.find((r) => r.id === baselineId);
      if (baselineResult?.classification === 'passed' && recentPassRate < 0.8) {
        regression = true;
      }
    }

    histories.push({
      specName: name,
      results,
      passRate,
      recentPassRate,
      previousPassRate,
      regression,
      trend: computeTrend(recentPassRate, previousPassRate),
    });
  }

  return histories.sort((a, b) => a.specName.localeCompare(b.specName));
}

function detectRegression(recentPassRate: number, previousPassRate: number): boolean {
  // Recent drops >40pp from prior window
  if (previousPassRate - recentPassRate > 0.4) return true;
  // Recent < 50% when previous >= 80%
  if (recentPassRate < 0.5 && previousPassRate >= 0.8) return true;
  return false;
}

function computeTrend(recentPassRate: number, previousPassRate: number): Trend {
  const diff = recentPassRate - previousPassRate;
  if (diff > 0.1) return 'improving';
  if (diff < -0.1) return 'declining';
  return 'stable';
}
