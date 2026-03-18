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

Rules:
- Write production-ready TypeScript code
- Max 300 lines per file (SRP principle)
- Use strict TypeScript (no \`any\` types)
- Follow existing patterns in the codebase
- Include all necessary imports
- Add brief JSDoc comment at the top of each file
- Do NOT include markdown fences or explanations — return ONLY the code
- If the task is to modify an existing file, return the complete updated file content`;

/**
 * Generate code for a single implementation task
 */
export async function generateCode(
  task: { title: string; description: string | null; file_path: string; task_type: string },
  featureContext: { feature_code: string; title: string; description: string; criteria: string[] },
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

Generate the complete code for this task. Return ONLY the code, no explanations.`;

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

    // Strip markdown fences if present
    let code = textBlock.text;
    const fenceMatch = code.match(/^```(?:typescript|tsx?|javascript|jsx?)?\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch) {
      code = fenceMatch[1];
    }

    return {
      code,
      log: `Generated ${code.split('\n').length} lines for ${task.file_path}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      code: '',
      log: `Failed: ${msg}`,
    };
  }
}
