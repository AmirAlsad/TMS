import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { TmsConfig } from '@tms/shared';
import { DEFAULT_PORT, tmsConfigSchema } from '@tms/shared';
import { findProjectRoot } from './project-root.js';

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_match, varName) => {
    return process.env[varName] ?? '';
  });
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === 'string') return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(): TmsConfig {
  const cwd = findProjectRoot();
  const yamlPath = path.join(cwd, 'tms.config.yaml');
  const jsonPath = path.join(cwd, 'tms.config.json');

  let raw: Record<string, unknown> | undefined;

  if (fs.existsSync(yamlPath)) {
    const content = fs.readFileSync(yamlPath, 'utf-8');
    raw = parseYaml(content) as Record<string, unknown>;
  } else if (fs.existsSync(jsonPath)) {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    raw = JSON.parse(content) as Record<string, unknown>;
  }

  if (!raw) {
    // Return a default config when no config file is found
    return {
      bot: { endpoint: 'http://localhost:3000/chat', method: 'POST' },
      server: { port: DEFAULT_PORT },
    };
  }

  const resolved = resolveEnvVarsDeep(raw);
  try {
    return tmsConfigSchema.parse(resolved) as TmsConfig;
  } catch (err) {
    console.error('[tms] Invalid config:', (err as Error).message);
    throw err;
  }
}
