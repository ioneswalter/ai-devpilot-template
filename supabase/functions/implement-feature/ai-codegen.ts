/**
 * AI Code Generation for FR-105
 * Generates implementation code for individual tasks using SpecKit artifacts
 * for full context (plan.md, data-model.md, contracts/).
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

export interface CodeGenResult {
  code: string;
  log: string;
}

export interface SpecArtifacts {
  plan?: string;
  data_model?: string;
  contracts?: string[];
  spec?: string;
  research?: string;
}

const CODEGEN_PROMPT = `You are a senior TypeScript engineer implementing a specific task in a full-stack monorepo.

Tech stack:
- Frontend: React 18 + TanStack Router/Query + Tailwind CSS (apps/web/src/)
- Backend: Supabase Edge Functions (Deno runtime) (supabase/functions/)
- Database: PostgreSQL via Prisma ORM
- Validation: Zod
- Auth: Supabase Auth (SMS OTP)

## Code quality guidelines:

1. **Aim for concise files.** Keep files under 300 lines (test files, migrations, and schemas can go up to 500). Outputs exceeding these limits are rejected.
2. **Functions should be under 50 lines.** Extract helpers for anything longer.
3. **Zero \`any\` types.** Use proper TypeScript types or \`unknown\` with type guards.
4. **Single Responsibility Principle.** One concern per file where practical.
5. **React components:** Extract large subcomponents into separate files when it improves clarity.
6. **Edge Functions:** Use thin router pattern — index.ts delegates to handler modules.
7. If companion files are needed, add a comment: \`// COMPANION FILES NEEDED: [list paths]\`

## Output rules:
- Return ONLY raw source code — no markdown fences, no \`\`\` blocks, no explanations
- For config files (JSON, YAML, TOML): return ONLY valid config content
- If companion files are needed, add a comment: \`// COMPANION FILES NEEDED: [list paths]\`
- Include all necessary imports
- Add brief JSDoc comment at the top
- ONLY reference files that exist in the sibling task list`;

/**
 * Generate code for a single implementation task.
 * Now includes SpecKit artifacts for full architectural context.
 */
export async function generateCode(
  task: { title: string; description: string | null; file_path: string; task_type: string },
  featureContext: { feature_code: string; title: string; description: string; criteria: string[] },
  siblingFilePaths: string[],
  artifacts: SpecArtifacts = {},
): Promise<CodeGenResult | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    return null;
  }

  const userMessage = buildUserMessage(task, featureContext, siblingFilePaths, artifacts);

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

    const code = stripMarkdownFences(textBlock.text);
    const lineCount = code.split('\n').length;
    const limit = getLineLimit(task.file_path);

    if (lineCount > limit) {
      console.warn(`Over limit: ${task.file_path} generated ${lineCount}/${limit} lines`);
      return {
        code: '',
        log: `REJECTED: ${lineCount} lines exceeds ${limit}-line limit. Split into smaller files.`,
      };
    }

    return { code, log: `Generated ${lineCount} lines for ${task.file_path}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { code: '', log: `Failed: ${msg}` };
  }
}

function buildUserMessage(
  task: { title: string; description: string | null; file_path: string; task_type: string },
  ctx: { feature_code: string; title: string; description: string; criteria: string[] },
  siblingFilePaths: string[],
  artifacts: SpecArtifacts,
): string {
  const sections: string[] = [];

  sections.push(`## Task
**Title:** ${task.title}
**File:** ${task.file_path}
**Type:** ${task.task_type}
**Description:** ${task.description || 'No additional description.'}`);

  sections.push(`## Feature Context
**Feature:** ${ctx.feature_code} — ${ctx.title}
**Description:** ${ctx.description}

**Acceptance Criteria:**
${ctx.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);

  // Include SpecKit artifacts for rich context
  if (artifacts.plan) {
    sections.push(`## Implementation Plan (from SpecKit plan.md)
${truncateArtifact(artifacts.plan, 4000)}`);
  }

  if (artifacts.data_model) {
    sections.push(`## Data Model (from SpecKit data-model.md)
${truncateArtifact(artifacts.data_model, 3000)}`);
  }

  if (artifacts.contracts && artifacts.contracts.length > 0) {
    const contractText = artifacts.contracts.map(c => truncateArtifact(c, 2000)).join('\n---\n');
    sections.push(`## API Contracts (from SpecKit contracts/)
${contractText}`);
  }

  if (artifacts.research) {
    sections.push(`## Technical Research (from SpecKit research.md)
${truncateArtifact(artifacts.research, 2000)}`);
  }

  sections.push(`## Sibling Files in This Feature
${siblingFilePaths.length > 0 ? siblingFilePaths.map(p => `- ${p}`).join('\n') : 'None — standalone task.'}`);

  sections.push('Generate the complete code for this task. Return ONLY raw source code.');

  return sections.join('\n\n');
}

/** File types that naturally run longer get a higher line limit */
function getLineLimit(filePath: string): number {
  const lower = filePath.toLowerCase();
  // Test files, migrations, schemas, and data models get 500 lines
  if (lower.includes('.test.') || lower.includes('.spec.')) return 500;
  if (lower.includes('test-utils') || lower.includes('test-helper')) return 500;
  if (lower.includes('/migrations/') || lower.endsWith('.sql')) return 500;
  if (lower.includes('schema.prisma') || lower.includes('data-model')) return 500;
  // Everything else: 300 lines
  return 300;
}

function stripMarkdownFences(text: string): string {
  let code = text.trim();
  const fenceMatch = code.match(/^```[\w]*\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) return fenceMatch[1];

  const innerMatch = code.match(/```[\w]*\s*\n([\s\S]*?)\n```/);
  if (innerMatch) return innerMatch[1];

  return code;
}

function truncateArtifact(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n[... truncated for context window ...]';
}
