import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BotConfig {
  port: number;
  anthropic: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
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

  if (!resolved.anthropic?.apiKey) {
    throw new Error(
      'Missing Anthropic API key. Set ANTHROPIC_API_KEY env var or configure it in config.yaml.',
    );
  }

  return {
    port: resolved.port ?? 3000,
    anthropic: {
      apiKey: resolved.anthropic.apiKey,
      model: resolved.anthropic.model ?? 'claude-sonnet-4-5-20250929',
      maxTokens: resolved.anthropic.maxTokens ?? 1024,
    },
    tms: {
      url: (resolved.tms as { url?: string })?.url ?? 'http://localhost:4000',
    },
    systemPrompt: resolved.systemPrompt ?? 'You are a helpful assistant.',
  };
}
