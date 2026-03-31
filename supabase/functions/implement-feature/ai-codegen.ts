/**
 * AI Code Generation for FR-105
 * Generates implementation code for individual tasks using SpecKit artifacts
 * for full context (plan.md, data-model.md, contracts/).
 *
 * @deprecated Phase 2 Strategy Decision: Code generation should happen through
 * Claude Code (SpecKit workflow) for higher quality artifacts. This Edge Function
 * codegen is retained for backward compatibility with the server-side pipeline
 * but new features should use `/speckit.implement` via Claude Code instead.
 * See: Strategic Plan I2-05.
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

## Existing project conventions (MUST follow):

### Frontend file placement:
- Feature UI components go in \`apps/web/src/features/<domain>/\` (e.g., \`features/roadmap/\`, \`features/admin/\`)
- Feature hooks go next to their components (e.g., \`features/roadmap/useSpecReview.ts\`)
- Feature types go next to their components (e.g., \`features/roadmap/spec-review-types.ts\`)
- Shared UI primitives go in \`apps/web/src/components/ui/\`
- API client functions go in \`apps/web/src/lib/api/admin-api.ts\` (add to existing file)
- Do NOT create \`apps/web/src/components/<feature>/\` directories — use \`features/<domain>/\` instead
- Do NOT create \`apps/web/src/hooks/\` for feature-specific hooks — colocate with feature
- Do NOT create standalone route pages for features that belong in the Roadmap — use modal panels in RoadmapContent.tsx

### Backend file placement:
- Each Edge Function lives in \`supabase/functions/<function-name>/\`
- Handler files go directly in the function directory (e.g., \`supabase/functions/spec-review/start-review.ts\`)
- Do NOT create \`handlers/\` or \`services/\` subdirectories inside Edge Functions
- Do NOT create \`supabase/functions/_shared/services/\` — keep handlers in the function directory
- Shared utilities: \`supabase/functions/_shared/\` (only for truly cross-function code)

### Import rules:
- Frontend path alias: \`@/\` maps to \`apps/web/src/\`
- Supabase client: import from \`@/lib/supabase-client\`
- API calls: import from \`@/lib/api/admin-api\`
- Edge Functions use Deno imports: \`https://deno.land/std@0.168.0/\`, \`https://esm.sh/\`
- Edge Functions use \`npm:\` prefix for npm packages (e.g., \`npm:@anthropic-ai/sdk@0.39.0\`)

## CRITICAL: Self-contained files only

Each generated file MUST be independently functional:
- Do NOT import from sibling task files unless those files already exist on disk
- The "Sibling Files" list shows PLANNED files — they may not be written yet or may be skipped
- Instead: define types inline, use existing shared modules, or use the API client
- If you need a type defined in another task, define it locally or in a shared types file
- If a companion file is essential, add a comment: \`// COMPANION: [path] — [what it should export]\`

## CRITICAL: Overwrite protection

Some files are SHARED across features and must NOT be regenerated from scratch:
- \`apps/web/src/lib/api/admin-api.ts\` — append new functions, never overwrite
- \`apps/web/src/features/roadmap/RoadmapContent.tsx\` — orchestrator, modify only
- \`prisma/schema.prisma\` — append models, never overwrite
- \`apps/web/src/lib/supabase-client.ts\` — shared utility, never overwrite

If your task targets one of these files with task_type "create", generate ONLY the new additions
wrapped in a comment block showing where to insert them. Do NOT generate the entire file.

## CRITICAL: Export naming conventions

When generating Edge Function handler files that will be imported by an index.ts router:
- Use NAMED exports (not default exports) with descriptive names matching the file
- Example: \`get-releases.ts\` → \`export async function getReleases(req: Request)\`
- Example: \`create-release.ts\` → \`export async function createRelease(req: Request)\`
- The index.ts router will import like: \`const { getReleases } = await import('./get-releases.ts')\`
- Keep export names consistent: \`{verb}{Entity}\` pattern (e.g., getRelease, createRelease, deployRelease)

When generating React components:
- Use named exports matching the filename: \`ReleasePanel.tsx\` → \`export function ReleasePanel()\`
- Export types/interfaces that other files might need

## CRITICAL: Database ID generation

When inserting rows into Supabase tables:
- ALWAYS include \`id: crypto.randomUUID()\` in insert objects unless you know the table has a default
- ALWAYS include \`created_at: new Date().toISOString()\` and \`updated_at: new Date().toISOString()\`
- Supabase tables in this project use TEXT ids with no auto-generation

## CRITICAL: Frontend/backend contract alignment

When generating an Edge Function handler, the request/response shape MUST match what the frontend sends:
- Check the admin-api.ts client functions to see what field names the frontend uses
- Example: if frontend sends \`{ id }\`, backend must destructure \`{ id }\` not \`{ releaseId }\`
- Example: if frontend sends \`{ title }\`, backend must use \`title\` not \`name\`
- Include CORS headers in ALL responses: \`'Access-Control-Allow-Origin': '*'\`

## Code quality guidelines:

1. **Aim for concise files.** Keep files under 300 lines (test files, migrations, and schemas can go up to 500). Outputs exceeding these limits are rejected.
2. **Functions should be under 50 lines.** Extract helpers for anything longer.
3. **Zero \`any\` types.** Use proper TypeScript types or \`unknown\` with type guards.
4. **Single Responsibility Principle.** One concern per file where practical.
5. **React components:** Extract large subcomponents into separate files when it improves clarity.
6. **Edge Functions:** Use thin router pattern — index.ts delegates to handler modules.

## Output rules:
- Return ONLY raw source code — no markdown fences, no \`\`\` blocks, no explanations
- For config files (JSON, YAML, TOML): return ONLY valid config content
- Include all necessary imports
- Add brief JSDoc comment at the top`;

/**
 * Generate code for a single implementation task.
 * Now includes SpecKit artifacts for full architectural context.
 */
/** @deprecated Use Claude Code SpecKit workflow instead. See Strategic Plan I2-05. */
export async function generateCode(
  task: { title: string; description: string | null; file_path: string; task_type: string },
  featureContext: { feature_code: string; title: string; description: string; criteria: string[] },
  siblingFilePaths: string[],
  artifacts: SpecArtifacts = {},
  existingContent?: string,
  learnedConstraints?: string[],
): Promise<CodeGenResult | null> {
  console.warn('[DEPRECATED] ai-codegen.generateCode called — prefer Claude Code /speckit.implement for higher quality output');
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    return null;
  }

  const userMessage = buildUserMessage(task, featureContext, siblingFilePaths, artifacts, existingContent, learnedConstraints);

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
  existingContent?: string,
  learnedConstraints?: string[],
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

  // If the file already exists, include current content so AI can MODIFY instead of replace
  if (existingContent) {
    sections.push(`## EXISTING FILE CONTENT (CRITICAL)
This file already exists in the codebase. You MUST:
1. Preserve ALL existing imports, functions, and logic that are not related to your task
2. ADD your changes to the existing code — do NOT remove or replace unrelated code
3. Merge your additions with the existing structure
4. Keep the same export names and component signatures

Current content of \`${task.file_path}\`:
\`\`\`
${truncateArtifact(existingContent, 6000)}
\`\`\``);
  }

  sections.push(`## Sibling Files in This Feature
${siblingFilePaths.length > 0 ? siblingFilePaths.map(p => `- ${p}`).join('\n') : 'None — standalone task.'}`);

  if (existingContent) {
    sections.push('Generate the COMPLETE updated file incorporating your changes into the existing code. Return ONLY raw source code.');
  } else {
    sections.push('Generate the complete code for this task. Return ONLY raw source code.');
  }

  // FR-118: Inject learned constraints from adaptive learning engine
  if (learnedConstraints && learnedConstraints.length > 0) {
    sections.push(`## Learned Constraints (from past failures)\n${learnedConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);
  }

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
