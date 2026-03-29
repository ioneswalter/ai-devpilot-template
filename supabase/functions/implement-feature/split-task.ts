/**
 * Auto-split oversized tasks into smaller subtasks.
 * Called when a task's generated code exceeds the 300-line constitution limit.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import type { AuthContext } from './shared.ts';

interface SubtaskDef {
  title: string;
  description: string;
  file_path: string;
  task_type: string;
}

const SPLIT_PROMPT = `You are a senior architect splitting an oversized implementation task into smaller subtasks.
Each subtask must produce a file UNDER 200 lines. Return a JSON array of subtasks.

Rules:
- Split by concern: types, utils/helpers, subcomponents, main file
- React components: separate container (logic) from presentational (JSX) components
- Edge Functions: router + handler modules (all in same directory, no subdirectories)
- Services: split by entity or workflow step
- Each subtask gets its own file_path — never duplicate the original
- 2-4 subtasks is ideal, never more than 5
- task_type must be one of: create, modify, test, config
- Each subtask file MUST be self-contained — do not create cross-dependencies between subtasks

File placement rules:
- Frontend features: apps/web/src/features/<domain>/
- Edge Function handlers: supabase/functions/<function-name>/ (flat, no subdirectories)
- Do NOT use: components/<feature>/, hooks/, handlers/, services/, utils/ subdirectories

Export naming:
- Edge Function handlers: named exports matching filename, e.g., get-releases.ts → export function getReleases()
- React components: named exports matching filename, e.g., ReleasePanel.tsx → export function ReleasePanel()

Overwrite protection — NEVER target these shared files as subtasks:
- apps/web/src/lib/api/admin-api.ts
- apps/web/src/features/roadmap/RoadmapContent.tsx
- prisma/schema.prisma

Return ONLY a JSON array, no explanation:
[{"title":"...","description":"...","file_path":"...","task_type":"create"}, ...]`;

/**
 * Ask AI to split a task into smaller subtasks, then insert them into the DB.
 * Returns the number of subtasks created.
 */
export async function autoSplitTask(
  ctx: AuthContext,
  task: { id: string; request_id: string; title: string; description: string | null; file_path: string; task_type: string; sort_order: number },
): Promise<number> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return 0;

  const subtasks = await askAiToSplit(apiKey, task);
  if (!subtasks || subtasks.length === 0) return 0;

  // Insert subtasks with sort_order after the parent
  const inserts = subtasks.map((st, i) => ({
    request_id: task.request_id,
    title: st.title,
    description: st.description,
    file_path: st.file_path,
    task_type: st.task_type,
    source: 'auto-split',
    decision: 'accepted',
    implementation_status: 'pending',
    sort_order: task.sort_order + i + 1,
  }));

  const { error } = await ctx.supabase
    .from('implementation_task_items')
    .insert(inserts);

  if (error) {
    console.error('Failed to insert subtasks:', error);
    return 0;
  }

  // Mark the parent task as split (distinct from failed)
  await ctx.supabase
    .from('implementation_task_items')
    .update({
      implementation_status: 'split',
      ai_log: `Auto-split into ${subtasks.length} smaller subtasks`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  console.log(`Auto-split "${task.title}" into ${subtasks.length} subtasks`);
  return subtasks.length;
}

async function askAiToSplit(apiKey: string, task: { title: string; description: string | null; file_path: string }): Promise<SubtaskDef[]> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SPLIT_PROMPT,
        messages: [{ role: 'user', content: `Split this task:\nTitle: ${task.title}\nFile: ${task.file_path}\nDescription: ${task.description || 'N/A'}` }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Split timeout')), 30000)),
    ]);

    const text = res.content.find((b: { type: string }) => b.type === 'text');
    if (!text || text.type !== 'text') return [];

    const jsonMatch = text.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]) as SubtaskDef[];
  } catch (err) {
    console.error('Auto-split AI call failed:', err);
    return [];
  }
}
