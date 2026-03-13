import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { evalSpecSchema } from '@tms/shared';
import type { EvalSpec } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

const EVALS_DIR = path.resolve(findProjectRoot(), 'evals');
const GLOBALS_DIR = path.join(EVALS_DIR, 'globals');

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

// --- Globals resolution (Tier 4.1) ---

interface GlobalRequirements {
  requirements?: string[];
  judgeInstructions?: string;
}

async function loadGlobals(name: string): Promise<GlobalRequirements> {
  const filePath = path.join(GLOBALS_DIR, `${name}.yaml`);
  const content = await fs.readFile(filePath, 'utf-8');
  const raw = (parseYaml(content) as Record<string, unknown>) ?? {};
  return {
    requirements: Array.isArray(raw.requirements)
      ? (raw.requirements as string[])
      : undefined,
    judgeInstructions:
      typeof raw.judgeInstructions === 'string' ? raw.judgeInstructions : undefined,
  };
}

/**
 * Resolve globals and merge their requirements/judgeInstructions into the spec.
 * Global requirements are prepended to spec-specific requirements.
 * Global judgeInstructions are prepended to spec-specific judge instructions.
 */
async function applyGlobals(spec: Record<string, unknown>): Promise<Record<string, unknown>> {
  const globalsField = spec.globals;
  if (!globalsField) return spec;

  const globalNames: string[] = Array.isArray(globalsField)
    ? (globalsField as string[])
    : [globalsField as string];

  const allGlobalReqs: string[] = [];
  const allGlobalInstructions: string[] = [];

  for (const name of globalNames) {
    try {
      const globals = await loadGlobals(name);
      if (globals.requirements) {
        allGlobalReqs.push(...globals.requirements);
      }
      if (globals.judgeInstructions) {
        allGlobalInstructions.push(globals.judgeInstructions);
      }
    } catch (err) {
      throw new Error(
        `Failed to load globals "${name}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  const result = { ...spec };

  // Prepend global requirements (spec-specific come after and thus take precedence in evaluation)
  const specReqs = Array.isArray(result.requirements) ? (result.requirements as string[]) : [];
  result.requirements = [...allGlobalReqs, ...specReqs];

  // Prepend global judge instructions
  if (allGlobalInstructions.length > 0) {
    const judge = (result.judge as Record<string, unknown>) ?? {};
    const specInstructions =
      typeof judge.instructions === 'string' ? judge.instructions : '';
    const combinedInstructions = [
      ...allGlobalInstructions,
      ...(specInstructions ? [specInstructions] : []),
    ].join('\n\n');
    result.judge = { ...judge, instructions: combinedInstructions };
  }

  return result;
}

async function loadRawSpec(nameOrPath: string): Promise<Record<string, unknown>> {
  // Support subdirectory paths like "mybot/silence-appropriate"
  const filePath =
    nameOrPath.includes('/') || nameOrPath.endsWith('.yaml') || nameOrPath.endsWith('.yml')
      ? nameOrPath.startsWith('/')
        ? nameOrPath
        : path.join(EVALS_DIR, nameOrPath.endsWith('.yaml') || nameOrPath.endsWith('.yml')
            ? nameOrPath
            : `${nameOrPath}.yaml`)
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
  let merged = deepMerge(defaults, resolved);

  // Apply globals (Tier 4.1) — merge global requirements into the spec
  merged = await applyGlobals(merged);

  const parsed = evalSpecSchema.parse(merged);
  return parsed;
}

export async function listEvalSpecs(): Promise<string[]> {
  try {
    const specs: string[] = [];

    // Load top-level specs
    const topFiles = await fs.readdir(EVALS_DIR);
    for (const f of topFiles) {
      if (
        (f.endsWith('.yaml') || f.endsWith('.yml')) &&
        f !== 'defaults.yaml' &&
        f !== 'defaults.yml'
      ) {
        specs.push(f.replace(/\.ya?ml$/, ''));
      }
    }

    // Load specs from subdirectories
    for (const entry of topFiles) {
      const entryPath = path.join(EVALS_DIR, entry);
      // Skip known non-spec directories
      if (entry === 'suites' || entry === 'globals') continue;
      try {
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
          const subFiles = await fs.readdir(entryPath);
          for (const f of subFiles) {
            if (f.endsWith('.yaml') || f.endsWith('.yml')) {
              specs.push(`${entry}/${f.replace(/\.ya?ml$/, '')}`);
            }
          }
        }
      } catch {
        // Not a directory or inaccessible — skip
      }
    }

    return specs;
  } catch {
    return [];
  }
}
