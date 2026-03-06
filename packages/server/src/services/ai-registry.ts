import { createProviderRegistry, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export const registry = createProviderRegistry({ anthropic, openai });

export function resolveModel(modelString: string): LanguageModel {
  return registry.languageModel(modelString as Parameters<typeof registry.languageModel>[0]);
}
