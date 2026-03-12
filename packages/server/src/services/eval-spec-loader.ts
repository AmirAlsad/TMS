import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { evalSpecSchema } from '@tms/shared';
import type { EvalSpec } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

const EVALS_DIR = path.resolve(findProjectRoot(), 'evals');

/** Deep merge b into a (b wins). Arrays are replaced, not merged. */
function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function loadRawSpec(nameOrPath: string): Promise<Record<string, unknown>> {
  const filePath =
    nameOrPath.includes('/') || nameOrPath.endsWith('.yaml') || nameOrPath.endsWith('.yml')
      ? path.resolve(nameOrPath)
      : path.join(EVALS_DIR, `${nameOrPath}.yaml`);

  const content = await fs.readFile(filePath, 'utf-8');
  return (parseYaml(content) as Record<string, unknown>) ?? {};
}

async function loadDefaults(): Promise<Record<string, unknown>> {
  try {
    const defaultsPath = path.join(EVALS_DIR, 'defaults.yaml');
    const content = await fs.readFile(defaultsPath, 'utf-8');
    return (parseYaml(content) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

async function resolveSpec(
  nameOrPath: string,
  seen: Set<string> = new Set(),
): Promise<Record<string, unknown>> {
  const key = nameOrPath.replace(/\.ya?ml$/, '');
  if (seen.has(key)) {
    throw new Error(`Circular extends detected: ${[...seen, key].join(' -> ')}`);
  }
  seen.add(key);

  const raw = await loadRawSpec(nameOrPath);

  // Handle extends
  const extendsName = raw.extends as string | undefined;
  delete raw.extends; // Don't include extends in the merged result

  if (extendsName) {
    const parent = await resolveSpec(extendsName, seen);
    return deepMerge(parent, raw);
  }

  return raw;
}

export async function loadEvalSpec(nameOrPath: string): Promise<EvalSpec> {
  const defaults = await loadDefaults();
  const resolved = await resolveSpec(nameOrPath);

  // Merge: defaults -> extended spec -> current spec
  const merged = deepMerge(defaults, resolved);

  const parsed = evalSpecSchema.parse(merged);
  return parsed;
}

export async function listEvalSpecs(): Promise<string[]> {
  try {
    const files = await fs.readdir(EVALS_DIR);
    return files
      .filter(
        (f) =>
          (f.endsWith('.yaml') || f.endsWith('.yml')) &&
          f !== 'defaults.yaml' &&
          f !== 'defaults.yml',
      )
      .map((f) => f.replace(/\.ya?ml$/, ''));
  } catch {
    return [];
  }
}
