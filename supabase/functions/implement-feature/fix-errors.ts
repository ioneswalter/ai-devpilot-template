/**
 * POST ?action=fix-errors handler: AI-powered build error fixer.
 * Receives tsc errors + file contents, asks AI to fix them, returns corrected code.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';

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
}

interface FixResult {
  path: string;
  code: string;
  changes: string;
}

const FIX_PROMPT = `You are a senior TypeScript engineer fixing build errors in a full-stack monorepo.

Tech stack:
- Frontend: React 18 + TanStack Router/Query + Tailwind CSS (apps/web/src/)
- Backend: Supabase Edge Functions (Deno runtime) (supabase/functions/)
- Path alias: @/ maps to apps/web/src/
- Validation: Zod

You will receive TypeScript compiler errors and the source files that contain them.
Fix ALL errors while preserving the existing functionality.

Common fixes needed:
- Missing imports: add the correct import statement
- Type mismatches: fix the type or add proper type assertions
- Missing modules: check if the import path is wrong, or define missing types inline
- Unused variables: remove them or prefix with underscore
- JSX issues: escape special characters, fix component props

Rules:
- Return ONLY a JSON array of fixed files
- Each entry has: path (string), code (string — full corrected file), changes (string — brief description)
- Only include files that actually need changes
- Do NOT change functionality — only fix type/build errors
- Do NOT add unnecessary type assertions or @ts-ignore comments
- Prefer proper type fixes over workarounds

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

  // Group errors by file
  const errorsByFile = new Map<string, BuildError[]>();
  for (const err of body.errors) {
    const existing = errorsByFile.get(err.file) ?? [];
    existing.push(err);
    errorsByFile.set(err.file, existing);
  }

  // Build user message with errors and file contents
  const sections: string[] = [];

  sections.push('## Build Errors\n');
  for (const [file, fileErrors] of errorsByFile) {
    sections.push(`### ${file}`);
    for (const e of fileErrors) {
      sections.push(`- Line ${e.line}: ${e.code}: ${e.message}`);
    }
    sections.push('');
  }

  sections.push('## Source Files\n');
  for (const file of body.files) {
    sections.push(`### ${file.path}\n\`\`\`typescript\n${file.content}\n\`\`\`\n`);
  }

  sections.push('Fix all the build errors listed above. Return ONLY a JSON array of fixed files.');

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        system: FIX_PROMPT,
        messages: [{ role: 'user', content: sections.join('\n') }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Fix errors timeout')), 120000)
      ),
    ]);

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
    console.error('Fix errors AI call failed:', msg);
    return errorResponse('AI_ERROR', `Failed to fix errors: ${msg}`, 500);
  }
}

function parseFixResponse(raw: string): FixResult[] | null {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Try extracting JSON from markdown fences
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
