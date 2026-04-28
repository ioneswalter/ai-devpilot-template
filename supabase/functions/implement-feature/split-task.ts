/**
 * Task splitting (FR-117 enhanced + original reactive split).
 * intelligentSplit() uses complexity score context for pre-emptive splitting.
 * autoSplitTask() remains as reactive fallback when generation exceeds limits.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import type { AuthContext } from './shared.ts';
import type { ComplexityScore } from './complexity-scorer.ts';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

interface SubtaskDef {
  title: string;
  description: string;
  file_path: string;
  task_type: string;
}

interface TaskInput {
  id: string;
  request_id: string;
  title: string;
  description: string | null;
  file_path: string;
  task_type: string;
  sort_order: number;
}

const SPLIT_RULES = `Rules:
- Split by concern: types, utils/helpers, subcomponents, main file
- React components: separate container (logic) from presentational (JSX)
- Edge Functions: router + handler modules (same directory, no subdirectories)
- Each subtask gets its own file_path — never duplicate the original
- 2-5 subtasks, each targeting < 4 files and < 200 lines
- task_type: create, modify, test, or config
- Each subtask MUST be self-contained

File placement:
- Frontend: apps/web/src/features/<domain>/
- Edge Functions: supabase/functions/<function-name>/ (flat)
- NEVER target: admin-api.ts, RoadmapContent.tsx, schema.prisma

Return ONLY JSON: [{"title":"...","description":"...","file_path":"...","task_type":"create"}, ...]`;

// ── Intelligent Split (FR-117) ──

export async function intelligentSplit(
  ctx: AuthContext,
  task: TaskInput,
  score: ComplexityScore
): Promise<number> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return 0;

  const layers = detectTaskLayers(task);
  const depContext = buildDependencyContext(task);
  const prompt = buildIntelligentPrompt(task, score, layers, depContext);

  const subtasks = await callAiForSplit(apiKey, prompt);
  if (!subtasks || subtasks.length === 0) return 0;

  const validated = validateSubtasks(subtasks);
  if (validated.length === 0) return 0;

  return await insertSplitResults(ctx, task, validated, score, layers);
}

function detectTaskLayers(task: TaskInput): string[] {
  const layers = new Set<string>();
  const path = task.file_path;
  const text = `${task.title} ${task.description || ''}`.toLowerCase();

  if (path.includes('apps/web/') || path.includes('.tsx')) layers.add('frontend');
  if (path.includes('supabase/functions/')) layers.add('backend');
  if (path.includes('packages/') || path.includes('lib/')) layers.add('shared');
  if (text.includes('component') || text.includes('panel')) layers.add('frontend');
  if (text.includes('endpoint') || text.includes('handler')) layers.add('backend');

  return layers.size > 0 ? Array.from(layers) : ['unknown'];
}

function buildDependencyContext(task: TaskInput): string {
  const dir = task.file_path.split('/').slice(0, -1).join('/');
  const text = task.description || '';
  const lines: string[] = [];

  lines.push(`Primary directory: ${dir}`);
  if (text.includes('import') || text.includes('depend')) {
    lines.push('Task mentions imports/dependencies — keep related modules together');
  }
  return lines.join('\n');
}

function buildIntelligentPrompt(
  task: TaskInput,
  score: ComplexityScore,
  layers: string[],
  depContext: string
): string {
  const factorBreakdown = Object.entries(score.factors)
    .map(([k, v]) => `  ${k}: ${v.score}/100 — ${v.detail}`)
    .join('\n');

  const layerInstruction =
    layers.length > 1
      ? `\nIMPORTANT: This task spans ${layers.join(' + ')} layers. Create separate subtasks for each layer. Backend subtasks should come first (dependency order).`
      : '';

  return `You are splitting a complex implementation task (complexity score: ${score.total}/${score.threshold}).

Factor breakdown:
${factorBreakdown}

${layerInstruction}

Dependencies:
${depContext}

${SPLIT_RULES}

Task to split:
Title: ${task.title}
File: ${task.file_path}
Type: ${task.task_type}
Description: ${task.description || 'N/A'}`;
}

function validateSubtasks(subtasks: SubtaskDef[]): SubtaskDef[] {
  if (subtasks.length < 2 || subtasks.length > 5) return [];

  return subtasks.filter((st) => {
    if (!st.title || !st.file_path || !st.task_type) return false;
    if (!['create', 'modify', 'test', 'config'].includes(st.task_type)) return false;
    const blocked = ['admin-api.ts', 'RoadmapContent.tsx', 'schema.prisma'];
    if (blocked.some((b) => st.file_path.includes(b))) return false;
    return true;
  });
}

async function insertSplitResults(
  ctx: AuthContext,
  task: TaskInput,
  subtasks: SubtaskDef[],
  score: ComplexityScore,
  layers: string[]
): Promise<number> {
  const reasoning =
    `Intelligent split (score ${score.total}/${score.threshold}). ` +
    `Layers: ${layers.join(', ')}. ` +
    `Created ${subtasks.length} subtasks: ${subtasks.map((s) => s.title).join('; ')}`;

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

  const { error } = await ctx.supabase.from('implementation_task_items').insert(inserts);
  if (error) {
    console.error('Failed to insert intelligent subtasks:', error);
    return 0;
  }

  await ctx.supabase
    .from('implementation_task_items')
    .update({
      implementation_status: 'split',
      ai_log: reasoning,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  console.log(`Intelligent split "${task.title}" into ${subtasks.length} subtasks`);
  return subtasks.length;
}

// ── Reactive Auto-Split (original, kept as fallback) ──

export async function autoSplitTask(ctx: AuthContext, task: TaskInput): Promise<number> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return 0;

  const prompt = `Split this oversized task into smaller subtasks.\n${SPLIT_RULES}\n\nTitle: ${task.title}\nFile: ${task.file_path}\nDescription: ${task.description || 'N/A'}`;
  const subtasks = await callAiForSplit(apiKey, prompt);
  if (!subtasks || subtasks.length === 0) return 0;

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

  const { error } = await ctx.supabase.from('implementation_task_items').insert(inserts);
  if (error) {
    console.error('Failed to insert subtasks:', error);
    return 0;
  }

  await ctx.supabase
    .from('implementation_task_items')
    .update({
      implementation_status: 'split',
      ai_log: `Auto-split into ${subtasks.length} subtasks`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  return subtasks.length;
}

// ── Shared AI Call ──

async function callAiForSplit(apiKey: string, prompt: string): Promise<SubtaskDef[]> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const res = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Split timeout')), 30000)),
    ]);

    logAIUsageFromEnv({
      featureId: 'pipeline',
      adminId: 'system',
      modelId: 'claude-haiku-4-5-20251001',
      operationType: 'task_splitting',
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
    });

    const text = res.content.find((b: { type: string }) => b.type === 'text');
    if (!text || text.type !== 'text') return [];

    const jsonMatch = text.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]) as SubtaskDef[];
  } catch (err) {
    console.error('Split AI call failed:', err);
    return [];
  }
}
