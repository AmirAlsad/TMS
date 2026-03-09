import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { evalSuiteSchema } from '@tms/shared';
import type { EvalSuite } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

const SUITES_DIR = path.resolve(findProjectRoot(), 'evals', 'suites');

export async function loadEvalSuite(name: string): Promise<EvalSuite> {
  const filePath = path.join(SUITES_DIR, `${name}.yaml`);
  const content = await fs.readFile(filePath, 'utf-8');
  const raw = parseYaml(content) as unknown;
  return evalSuiteSchema.parse(raw);
}

export async function listEvalSuites(): Promise<string[]> {
  try {
    const files = await fs.readdir(SUITES_DIR);
    return files
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => f.replace(/\.ya?ml$/, ''));
  } catch {
    return [];
  }
}
