/**
 * CI Check — Validation and Fix logic (FR-114)
 * AI-based code validation for TypeScript, ESLint, and test stages
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

const AI_MODEL = 'claude-sonnet-4-6';

type CIStage = 'typecheck' | 'lint' | 'test';

interface GeneratedFile {
  file_path: string;
  code: string;
  task_title: string;
}

const STAGE_LABELS: Record<CIStage, string> = {
  typecheck: 'TypeScript',
  lint: 'ESLint',
  test: 'Vitest',
};

const VALIDATION_PROMPTS: Record<CIStage, string> = {
  typecheck: `Validate the TypeScript code for type safety issues:
- Check for missing or incorrect imports
- Check for type mismatches, missing properties, or wrong argument types
- Check for undefined variables or functions
- Check for incorrect generic type parameters
- Check that JSX props match component interfaces
- Check that async/await is used correctly

If the code is valid, respond with: PASS
If there are errors, respond with a JSON array:
[{"file":"path","line":1,"code":"TS2345","message":"Type 'string' is not assignable to type 'number'"}]`,

  lint: `Validate the code against common ESLint rules:
- React hooks must follow rules-of-hooks (no conditional hooks)
- useEffect/useCallback must list all dependencies
- No unused variables or imports
- Prefer const over let when value isn't reassigned
- No any types (use proper types)
- Components in .tsx files should be the only exports

If the code is valid, respond with: PASS
If there are violations, respond with a JSON array:
[{"file":"path","line":1,"code":"react-hooks/exhaustive-deps","message":"Missing dependency 'x' in deps array"}]`,

  test: `Validate the test code for correctness:
- Check test assertions match the implementation logic
- Check mocks are properly set up for dependencies
- Check async tests use proper await/act() patterns
- Check import paths match actual exports
- Check test descriptions match what is being tested

If the tests are valid, respond with: PASS
If there are issues, respond with a JSON array:
[{"file":"path","line":1,"code":"test-logic","message":"Assertion expects 'foo' but implementation returns 'bar'"}]`,
};

const FIX_PROMPT = `You are a senior TypeScript engineer fixing code issues.

Rules:
- Return ONLY a JSON array of fixed files
- Each entry: {"path":"...","code":"...full corrected file...","changes":"brief description"}
- Only include files that need changes
- Do NOT change functionality — only fix the reported issues
- Keep files under 300 lines (test files up to 500)
- Return valid JSON only, no markdown`;

export { AI_MODEL, STAGE_LABELS, FIX_PROMPT };
export type { CIStage, GeneratedFile };

/** Validate a single CI stage using AI */
export async function validateStage(
  anthropic: Anthropic,
  stage: CIStage,
  files: GeneratedFile[],
  feature: { title: string; description: string; acceptance_criteria: string[] } | null
): Promise<Array<{ file: string; line: number; message: string; code: string }>> {
  const filesContext = files
    .map((f) => `### ${f.file_path}\n\`\`\`typescript\n${f.code}\n\`\`\``)
    .join('\n\n');

  const featureContext = feature
    ? `Feature: ${feature.title}\nDescription: ${feature.description}\nCriteria: ${(feature.acceptance_criteria || []).join('; ')}`
    : '';

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 8192,
        system: `You are validating generated code. ${VALIDATION_PROMPTS[stage]}`,
        messages: [
          {
            role: 'user',
            content: `${featureContext}\n\n## Generated Code Files\n\n${filesContext}\n\nValidate all files for ${STAGE_LABELS[stage]} issues. Respond with PASS or a JSON error array.`,
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CI validation timeout')), 90000)
      ),
    ]);

    logAIUsageFromEnv({
      featureId: 'pipeline',
      adminId: 'system',
      modelId: AI_MODEL,
      operationType: 'ci_check',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const text = response.content.find((b: { type: string }) => b.type === 'text');
    if (!text || text.type !== 'text') return [];

    const content = text.text.trim();
    if (content === 'PASS' || content.toUpperCase().startsWith('PASS')) return [];

    return parseErrors(content);
  } catch (error) {
    console.error(`CI ${stage} validation error:`, error);
    return [
      { file: '', line: 0, code: stage, message: `Validation error: ${(error as Error).message}` },
    ];
  }
}

/** Attempt to fix errors using AI */
export async function fixErrors(
  anthropic: Anthropic,
  stage: CIStage,
  errors: Array<{ file: string; line: number; message: string; code: string }>,
  files: GeneratedFile[]
): Promise<Array<{ path: string; code: string; changes: string }> | null> {
  const errorList = errors.map((e) => `- ${e.file}:${e.line} [${e.code}] ${e.message}`).join('\n');
  const filesContext = files
    .map((f) => `### ${f.file_path}\n\`\`\`typescript\n${f.code}\n\`\`\``)
    .join('\n\n');

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 16384,
        system: FIX_PROMPT,
        messages: [
          {
            role: 'user',
            content: `## ${STAGE_LABELS[stage]} Errors\n${errorList}\n\n## Source Files\n${filesContext}\n\nFix all errors. Return JSON array only.`,
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CI fix timeout')), 120000)
      ),
    ]);

    logAIUsageFromEnv({
      featureId: 'pipeline',
      adminId: 'system',
      modelId: AI_MODEL,
      operationType: 'ci_check',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const text = response.content.find((b: { type: string }) => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    return parseFixes(text.text);
  } catch (error) {
    console.error(`CI fix error:`, error);
    return null;
  }
}

function parseErrors(
  raw: string
): Array<{ file: string; line: number; message: string; code: string }> {
  try {
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
  }
  return [];
}

function parseFixes(raw: string): Array<{ path: string; code: string; changes: string }> | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}
