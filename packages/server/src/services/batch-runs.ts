import fs from 'node:fs/promises';
import path from 'node:path';
import type { BatchRun } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

const BATCHES_DIR = path.resolve(findProjectRoot(), 'eval-results', 'batches');

export function generateBatchId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `batch_${timestamp}_${suffix}`;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(BATCHES_DIR, { recursive: true });
}

export async function saveBatchRun(run: BatchRun): Promise<void> {
  await ensureDir();
  const filePath = path.join(BATCHES_DIR, `${run.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(run, null, 2), 'utf-8');
}

export async function getBatchRun(id: string): Promise<BatchRun | null> {
  const filePath = path.join(BATCHES_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as BatchRun;
  } catch {
    return null;
  }
}

export async function listBatchRuns(): Promise<BatchRun[]> {
  try {
    await ensureDir();
    const files = await fs.readdir(BATCHES_DIR);
    const runs: BatchRun[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await fs.readFile(path.join(BATCHES_DIR, file), 'utf-8');
      runs.push(JSON.parse(content) as BatchRun);
    }

    runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return runs;
  } catch {
    return [];
  }
}
