import fs from 'node:fs/promises';
import path from 'node:path';
import type { EvalResult } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

const RESULTS_DIR = path.resolve(findProjectRoot(), 'eval-results');

export function generateEvalId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

export async function saveEvalResult(result: EvalResult): Promise<void> {
  await ensureDir();
  const filePath = path.join(RESULTS_DIR, `${result.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

export async function getEvalResult(id: string): Promise<EvalResult | null> {
  const filePath = path.join(RESULTS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as EvalResult;
  } catch {
    return null;
  }
}

export async function listEvalResults(): Promise<EvalResult[]> {
  try {
    await ensureDir();
    const files = await fs.readdir(RESULTS_DIR);
    const results: EvalResult[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await fs.readFile(path.join(RESULTS_DIR, file), 'utf-8');
      results.push(JSON.parse(content) as EvalResult);
    }

    results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return results;
  } catch {
    return [];
  }
}
