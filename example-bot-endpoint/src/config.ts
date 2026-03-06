import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BotConfig {
  port: number;
  model: string;
  maxTokens: number;
  maxSteps: number;
  tms: {
    url: string;
  };
  systemPrompt: string;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)}/g, (_, name) => process.env[name] ?? '');
}

function resolveDeep(obj: unknown): unknown {
  if (typeof obj === 'string') return resolveEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(resolveDeep);
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveDeep(val);
    }
    return result;
  }
  return obj;
}

export function loadConfig(): BotConfig {
  const configPath = resolve(__dirname, '..', 'config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;
  const resolved = resolveDeep(parsed) as Record<string, unknown> & BotConfig;

  return {
    port: (resolved.port as number) ?? 3000,
    model: (resolved.model as string) ?? 'anthropic:claude-sonnet-4-6',
    maxTokens: (resolved.maxTokens as number) ?? 1024,
    maxSteps: (resolved.maxSteps as number) ?? 5,
    tms: {
      url: (resolved.tms as { url?: string })?.url ?? 'http://localhost:4000',
    },
    systemPrompt: (resolved.systemPrompt as string) ?? 'You are a helpful assistant.',
  };
}
