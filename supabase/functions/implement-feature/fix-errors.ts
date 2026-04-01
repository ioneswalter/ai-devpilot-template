/**
 * POST ?action=fix-errors handler: AI-powered CI error fixer.
 * Handles TypeScript, ESLint, and test errors — asks AI to fix them, returns corrected code.
 *
 * @deprecated Phase 2 Strategy Decision: Error fixing during implementation should
 * happen through Claude Code (SpecKit workflow) which has full codebase context.
 * This handler is retained for the server-side pipeline but new features should
 * use Claude Code for implementation. See: Strategic Plan I2-05.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

interface BuildError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

interface FileContent {
  path: string;
  content: string;
}

interface FixRequest {
  errors: BuildError[];
  files: FileContent[];
  stage?: 'typecheck' | 'lint' | 'test';
}

interface FixResult {
  path: string;
  code: string;
  changes: string;
}

const STAGE_PROMPTS: Record<string, string> = {
  typecheck: `Common TypeScript fixes:
- Missing imports: add the correct import statement
- Type mismatches: fix the type or add proper type assertions
- Missing modules: check if the import path is wrong, or define missing types inline
- Unused variables: remove them or prefix with underscore
- JSX issues: escape special characters, fix component props`,

  lint: `Common ESLint fixes:
- react-hooks/rules-of-hooks: ensure hooks are only called at top level of components/hooks
- react-hooks/exhaustive-deps: add missing dependencies to useEffect/useCallback arrays
- @typescript-eslint/no-unused-vars: remove unused imports/variables or prefix with underscore
- react-refresh/only-export-components: ensure only components are exported from .tsx files
- Prefer const over let when variable is never reassigned
- Remove console.log statements (use proper logging)`,

  test: `Common test failure fixes:
- Fix assertion mismatches by correcting expected values or implementation logic
- Fix missing mock setup — ensure required mocks are in place
- Fix import errors in test files — match actual export names
- Fix async test issues — ensure proper await/act() usage
- Do NOT change test expectations to match buggy code — fix the source code instead`,
};

const BASE_PROMPT = `You are a senior TypeScript engineer fixing CI pipeline errors in a full-stack monorepo.

Tech stack:
- Frontend: React 18 + TanStack Router/Query + Tailwind CSS (apps/web/src/)
- Backend: Supabase Edge Functions (Deno runtime) (supabase/functions/)
- Path alias: @/ maps to apps/web/src/
- Validation: Zod

Rules:
- Return ONLY a JSON array of fixed files
- Each entry has: path (string), code (string — full corrected file), changes (string — brief description)
- Only include files that actually need changes
- Do NOT change functionality — only fix the reported errors
- Do NOT add unnecessary type assertions or @ts-ignore comments
- Prefer proper fixes over workarounds
- Keep files under 300 lines (test files can be up to 500)

Return format (ONLY valid JSON, no markdown):
[{"path":"apps/web/src/file.tsx","code":"...full corrected code...","changes":"Added missing import for X"}]`;

export async function handleFixErrors(req: Request, _ctx: AuthContext): Promise<Response> {
  const body: FixRequest = await req.json();

  if (!body.errors?.length) {
    return jsonResponse({ data: { fixes: [], message: 'No errors to fix' } });
  }

  if (!body.files?.length) {
    return errorResponse('VALIDATION_ERROR', 'files array is required', 400);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return errorResponse('CONFIG_ERROR', 'ANTHROPIC_API_KEY not configured', 500);
  }

  const stage = body.stage ?? 'typecheck';
  const stageHints = STAGE_PROMPTS[stage] ?? STAGE_PROMPTS.typecheck;
  const systemPrompt = `${BASE_PROMPT}\n\n${stageHints}`;
  const userMessage = buildFixMessage(body.errors, body.files, stage);

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Fix errors timeout')), 120000)
      ),
    ]);

    logAIUsageFromEnv({
      featureId: 'pipeline', adminId: 'system', modelId: 'claude-sonnet-4-6',
      operationType: 'error_fixing', inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return errorResponse('AI_ERROR', 'No response from AI', 500);
    }

    const fixes = parseFixResponse(textBlock.text);
    if (!fixes) {
      return errorResponse('AI_ERROR', 'Could not parse AI fix response', 500);
    }

    return jsonResponse({ data: { fixes, error_count: body.errors.length } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Fix ${stage} errors AI call failed:`, msg);
    return errorResponse('AI_ERROR', `Failed to fix errors: ${msg}`, 500);
  }
}

function buildFixMessage(errors: BuildError[], files: FileContent[], stage: string): string {
  const sections: string[] = [];
  const stageLabel = stage === 'typecheck' ? 'TypeScript' : stage === 'lint' ? 'ESLint' : 'Test';

  // Group errors by file
  const errorsByFile = new Map<string, BuildError[]>();
  for (const err of errors) {
    const existing = errorsByFile.get(err.file) ?? [];
    existing.push(err);
    errorsByFile.set(err.file, existing);
  }

  sections.push(`## ${stageLabel} Errors\n`);
  for (const [file, fileErrors] of errorsByFile) {
    sections.push(`### ${file}`);
    for (const e of fileErrors) {
      sections.push(`- Line ${e.line}: ${e.code}: ${e.message}`);
    }
    sections.push('');
  }

  sections.push('## Source Files\n');
  for (const file of files) {
    sections.push(`### ${file.path}\n\`\`\`typescript\n${file.content}\n\`\`\`\n`);
  }

  sections.push(`Fix all the ${stageLabel} errors listed above. Return ONLY a JSON array of fixed files.`);
  return sections.join('\n');
}

function parseFixResponse(raw: string): FixResult[] | null {
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
