/**
 * Prototype Generator — classifies feature descriptions and generates
 * interactive HTML prototypes via Claude API.
 * FR-140: AI Prototype Builder
 */

import {
  CLASSIFY_PROMPT,
  getPromptForType,
  getIterationPrompt,
} from '../_shared/prototype-prompts.ts';

interface ClassifyResult {
  type: 'ui' | 'flowchart' | 'process' | 'ambiguous';
  confidence: number;
  detected_types?: string[];
  reasoning: string;
}

interface GenerateResult {
  html: string;
  prototype_type: 'ui' | 'flowchart' | 'process';
  confidence: number;
}

interface GenerateError {
  error_code: 'GENERATION_TIMEOUT' | 'GENERATION_FAILED';
  message: string;
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const GENERATION_TIMEOUT_MS = 60_000;

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 16384
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error?.message ?? 'Claude API error');
    }

    const text = data.content?.[0]?.text ?? '';
    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyFeature(description: string): Promise<ClassifyResult> {
  const { text } = await callClaude(CLASSIFY_PROMPT, description, 256);
  try {
    return JSON.parse(text.trim());
  } catch {
    return { type: 'ui', confidence: 0.5, reasoning: 'Parse failed, defaulting to UI' };
  }
}

export async function generatePrototype(
  description: string,
  prototypeType: 'ui' | 'flowchart' | 'process'
): Promise<GenerateResult | GenerateError> {
  const systemPrompt = getPromptForType(prototypeType);

  try {
    const { text } = await callClaude(systemPrompt, description);
    const html = stripCodeFences(text);

    if (!html || html.length < 50) {
      return { error_code: 'GENERATION_FAILED', message: 'Generated content too short' };
    }

    return { html, prototype_type: prototypeType, confidence: 1.0 };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        error_code: 'GENERATION_TIMEOUT',
        message: 'Prototype generation exceeded 60 seconds. Try simplifying your description.',
      };
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { error_code: 'GENERATION_FAILED', message: msg };
  }
}

export async function iteratePrototype(
  currentContent: string,
  feedback: string
): Promise<GenerateResult | GenerateError> {
  const systemPrompt = getIterationPrompt(currentContent, feedback);

  try {
    const { text } = await callClaude(systemPrompt, feedback);
    const html = stripCodeFences(text);

    if (!html || html.length < 50) {
      return { error_code: 'GENERATION_FAILED', message: 'Iteration produced empty content' };
    }

    return { html, prototype_type: 'ui', confidence: 1.0 };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        error_code: 'GENERATION_TIMEOUT',
        message: 'Iteration exceeded 60 seconds. Try a simpler change.',
      };
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { error_code: 'GENERATION_FAILED', message: msg };
  }
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```html?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

export function isGenerateError(result: GenerateResult | GenerateError): result is GenerateError {
  return 'error_code' in result;
}
