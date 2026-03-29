/**
 * AI Implementation generation for FR-105
 * Calls Claude to produce a structured implementation plan from feature spec
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

export interface ImplementationTask {
  title: string;
  description: string;
  file_path: string;
  task_type: 'create' | 'modify' | 'test' | 'config';
}

export interface ImplementationPlan {
  summary: string;
  tasks: ImplementationTask[];
  architecture_notes: string;
  raw_response: string;
}

interface TestCaseRow {
  test_code: string;
  title: string;
  description?: string;
}

const IMPLEMENTATION_PROMPT = `You are a senior software engineer generating an implementation plan for a feature.

You are working in a full-stack TypeScript monorepo:
- Frontend: React 18 + TanStack Router/Query + Tailwind CSS (apps/web/src/)
- Backend: Supabase Edge Functions (Deno runtime) (supabase/functions/)
- Database: PostgreSQL via Prisma ORM (prisma/schema.prisma)
- Auth: Supabase Auth (SMS OTP)
- Validation: Zod

## Existing project structure (MUST follow):

### Frontend conventions:
- Feature components: \`apps/web/src/features/<domain>/ComponentName.tsx\`
- Feature hooks: \`apps/web/src/features/<domain>/useHookName.ts\`
- Feature types: \`apps/web/src/features/<domain>/<feature>-types.ts\`
- API functions: ADD to existing \`apps/web/src/lib/api/admin-api.ts\` (do NOT create new API files)
- Shared UI: \`apps/web/src/components/ui/\`
- Features integrate into the Roadmap page as modal panels — do NOT create standalone route pages
- Do NOT use \`apps/web/src/components/<feature>/\` — use \`features/<domain>/\` instead
- Do NOT use \`apps/web/src/hooks/\` for feature hooks — colocate with feature

### Backend conventions:
- Edge Functions: \`supabase/functions/<function-name>/index.ts\` with handler files alongside
- Handler files go directly in function directory (e.g., \`supabase/functions/my-fn/handler.ts\`)
- Do NOT create \`handlers/\`, \`services/\`, or \`utils/\` subdirectories inside Edge Functions
- Validation schemas: colocate in function directory (e.g., \`schemas.ts\`)

### Database:
- Migrations: \`supabase/migrations/\` (SQL files, NOT prisma/migrations/)
- Schema updates: \`prisma/schema.prisma\`

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "summary": "Brief implementation overview (2-3 sentences)",
  "architecture_notes": "Key architectural decisions and patterns to follow",
  "tasks": [
    {
      "title": "Short task title",
      "description": "Detailed implementation instructions",
      "file_path": "relative/path/to/file.ts",
      "task_type": "create|modify|test|config"
    }
  ]
}

## Overwrite protection — NEVER regenerate these shared files:
- \`apps/web/src/lib/api/admin-api.ts\` — use task_type "modify" to append new functions
- \`apps/web/src/features/roadmap/RoadmapContent.tsx\` — use task_type "modify" to add integration
- \`prisma/schema.prisma\` — use task_type "modify" to append models
- \`apps/web/src/lib/supabase-client.ts\` — never target this file

## Frontend/backend contract alignment:
When planning both frontend API client additions AND backend Edge Function handlers,
ensure the field names MATCH exactly:
- If frontend sends \`{ id }\`, backend must expect \`{ id }\` (not \`{ releaseId }\`)
- If frontend sends \`{ title }\`, backend must use \`title\` (not \`name }\`)
- Define the contract once and use it consistently across both layers

## Database conventions:
- All tables use TEXT ids (not UUID) with NO auto-generation — handlers must generate \`crypto.randomUUID()\`
- Always include \`created_at\` and \`updated_at\` timestamps on inserts

Guidelines:
- Generate 5-15 specific, actionable implementation tasks
- Each task should target a single file
- Order tasks by dependency (setup first, then models, services, UI)
- Include test tasks for key acceptance criteria
- Follow SRP: max 300 lines per file
- Each file MUST be self-contained — do NOT create cross-dependencies between tasks
- Be specific about what code to write, not vague instructions
- Edge Function handlers: use named exports matching the filename pattern \`{verb}{Entity}\`
- Include CORS headers in ALL Edge Function responses`;

/**
 * Call Claude AI to generate an implementation plan
 * Returns null if AI is unavailable
 */
export async function generateImplementation(
  featureCode: string,
  title: string,
  description: string,
  criteria: string[],
  testCases: TestCaseRow[],
  notes: string | null,
): Promise<ImplementationPlan | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    console.warn('ANTHROPIC_API_KEY not set — skipping AI implementation');
    return null;
  }

  const userMessage = `## Feature to Implement

**Feature Code:** ${featureCode}
**Title:** ${title}
**Description:** ${description}

### Acceptance Criteria:
${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'None defined.'}

### Test Cases:
${testCases.length > 0 ? testCases.map(tc => `- ${tc.test_code}: ${tc.title}`).join('\n') : 'None defined.'}

### Implementation Notes:
${notes || 'No additional notes.'}

Generate a detailed implementation plan for this feature.`;

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: IMPLEMENTATION_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI implementation timeout')), 60000)
      ),
    ]);

    const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('No text block in AI response');
      return null;
    }

    return parseImplementationResponse(textBlock.text);
  } catch (error) {
    console.error('AI implementation generation failed:', error);
    return null;
  }
}

function parseImplementationResponse(rawText: string): ImplementationPlan | null {
  try {
    let parsed: { summary?: string; tasks?: ImplementationTask[]; architecture_notes?: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        console.error('Could not extract JSON from AI response');
        return null;
      }
      parsed = JSON.parse(jsonMatch[1].trim());
    }

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      console.error('Invalid AI response — missing tasks array');
      return null;
    }

    const validTypes = ['create', 'modify', 'test', 'config'];
    const tasks = parsed.tasks
      .filter(t => t.title && t.file_path && validTypes.includes(t.task_type))
      .map(t => ({
        title: t.title,
        description: t.description || '',
        file_path: t.file_path,
        task_type: t.task_type,
      }));

    return {
      summary: parsed.summary || 'Implementation plan generated.',
      tasks,
      architecture_notes: parsed.architecture_notes || '',
      raw_response: rawText,
    };
  } catch (error) {
    console.error('Failed to parse AI implementation response:', error);
    return null;
  }
}
