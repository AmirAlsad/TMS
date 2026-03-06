import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { evalSpecSchema } from '@tms/shared';
import type { EvalSpec } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

const EVALS_DIR = path.resolve(findProjectRoot(), 'evals');

export async function loadEvalSpec(nameOrPath: string): Promise<EvalSpec> {
  const filePath =
    nameOrPath.includes('/') || nameOrPath.endsWith('.yaml') || nameOrPath.endsWith('.yml')
      ? path.resolve(nameOrPath)
      : path.join(EVALS_DIR, `${nameOrPath}.yaml`);

  const content = await fs.readFile(filePath, 'utf-8');
  const raw = parseYaml(content) as unknown;
  const parsed = evalSpecSchema.parse(raw);
  return parsed;
}

export async function listEvalSpecs(): Promise<string[]> {
  try {
    const files = await fs.readdir(EVALS_DIR);
    return files
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => f.replace(/\.ya?ml$/, ''));
  } catch {
    return [];
  }
}
