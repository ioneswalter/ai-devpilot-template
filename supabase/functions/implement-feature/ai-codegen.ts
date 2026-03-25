/**
 * AI Code Generation for FR-105
 * Generates actual implementation code for individual tasks.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

export interface CodeGenResult {
  code: string;
  log: string;
}

const CODEGEN_PROMPT = `You are a senior TypeScript engineer implementing a specific task in a full-stack monorepo.

Tech stack:
- Frontend: React 18 + TanStack Router/Query + Tailwind CSS (apps/web/src/)
- Backend: Supabase Edge Functions (Deno runtime) (supabase/functions/)
- Database: PostgreSQL via Prisma ORM
- Validation: Zod
- Auth: Supabase Auth (SMS OTP)

## CONSTITUTION (NON-NEGOTIABLE — code that violates these rules will be REJECTED):

1. **HARD LIMIT: 200 lines per file.** Your output MUST be under 200 lines. This is enforced programmatically — outputs over 200 lines are automatically rejected. Plan accordingly.
2. **Functions must be under 50 lines.** Extract helpers for anything longer.
3. **Zero \`any\` types.** Use proper TypeScript types or \`unknown\` with type guards.
4. **Single Responsibility Principle.** One concern per file.
5. **React components:** If JSX would exceed 80 lines, extract subcomponents into separate files and import them. Return the main file only, and list the subcomponent file paths in a comment at the top.
6. **Edge Functions:** Use thin router pattern — index.ts delegates to handler modules. Each handler must be its own file under 200 lines.
7. **Services/hooks:** Split by domain concern. A service should handle ONE entity or ONE workflow.

## How to stay under 200 lines:
- Extract types/interfaces into a separate types.ts file
- Extract helper functions into utils files
- Split React components: container (logic) + presentational (JSX)
- For Edge Functions: router + handler + shared modules
- Add a top comment listing companion files the developer should also create

## Output rules:
- Return ONLY raw source code — no markdown fences, no \`\`\` blocks, no explanations
- For config files (JSON, YAML, TOML): return ONLY valid config content, no markdown wrapping
- If companion files are needed, add a comment at the top: \`// COMPANION FILES NEEDED: [list paths]\`
- Include all necessary imports
- Add brief JSDoc comment at the top (skip for JSON/config files)
- ONLY reference files that exist in the sibling task list provided below — do NOT invent filenames`;

/**
 * Generate code for a single implementation task
 */
export async function generateCode(
  task: { title: string; description: string | null; file_path: string; task_type: string },
  featureContext: { feature_code: string; title: string; description: string; criteria: string[] },
  siblingFilePaths: string[] = [],
): Promise<CodeGenResult | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    return null;
  }

  const userMessage = `## Task
**Title:** ${task.title}
**File:** ${task.file_path}
**Type:** ${task.task_type}
**Description:** ${task.description || 'No additional description.'}

## Feature Context
**Feature:** ${featureContext.feature_code} — ${featureContext.title}
**Description:** ${featureContext.description}

**Acceptance Criteria:**
${featureContext.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Sibling Files in This Feature
${siblingFilePaths.length > 0 ? siblingFilePaths.map(p => `- ${p}`).join('\n') : 'None — this is a standalone task.'}

Generate the complete code for this task. Return ONLY raw source code, no markdown fences, no explanations.`;

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: CODEGEN_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Code generation timeout')), 90000)
      ),
    ]);

    const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return null;
    }

    // Strip markdown fences if present (any language tag or none)
    let code = textBlock.text.trim();
    const fenceMatch = code.match(/^```[\w]*\s*\n([\s\S]*?)\n```\s*$/);
    if (fenceMatch) {
      code = fenceMatch[1];
    } else {
      // Handle fences embedded in surrounding text
      const innerMatch = code.match(/```[\w]*\s*\n([\s\S]*?)\n```/);
      if (innerMatch) {
        code = innerMatch[1];
      }
    }

    const lineCount = code.split('\n').length;
    const MAX_LINES = 300;

    if (lineCount > MAX_LINES) {
      console.warn(`Constitution violation: ${task.file_path} generated ${lineCount} lines (max ${MAX_LINES})`);
      return {
        code: '',
        log: `REJECTED: ${lineCount} lines exceeds ${MAX_LINES}-line constitution limit. Task needs to be split into smaller files.`,
      };
    }

    return {
      code,
      log: `Generated ${lineCount} lines for ${task.file_path}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      code: '',
      log: `Failed: ${msg}`,
    };
  }
}
