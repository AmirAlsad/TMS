import fs from 'node:fs';
import path from 'node:path';
import type { EvalSpec } from '@tms/shared';
import { loadEvalSpec } from '@tms/server/services';

export function resolveSpecPath(nameOrPath: string): string {
  // If it looks like a path (has extension or separator), use directly
  if (nameOrPath.includes(path.sep) || nameOrPath.includes('/') || path.extname(nameOrPath)) {
    const resolved = path.resolve(nameOrPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Spec file not found: ${resolved}`);
    }
    return resolved;
  }

  // Otherwise, look in evals/ directory
  const evalsDir = path.resolve('evals');
  const yamlPath = path.join(evalsDir, `${nameOrPath}.yaml`);
  const ymlPath = path.join(evalsDir, `${nameOrPath}.yml`);

  if (fs.existsSync(yamlPath)) return yamlPath;
  if (fs.existsSync(ymlPath)) return ymlPath;

  throw new Error(
    `Spec "${nameOrPath}" not found. Looked for:\n  ${yamlPath}\n  ${ymlPath}`,
  );
}

export async function loadSpec(nameOrPath: string): Promise<EvalSpec> {
  const specPath = resolveSpecPath(nameOrPath);
  return loadEvalSpec(specPath);
}
