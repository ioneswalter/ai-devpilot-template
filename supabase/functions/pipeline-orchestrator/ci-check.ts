/**
 * CI Check: AI-based code validation with auto-fix loop (FR-114)
 * Runs TypeScript, ESLint, and test validation via Claude AI
 * Up to 3 fix attempts per stage before marking as failed
 *
 * Logic is split across:
 * - ci-check-validation.ts (AI validation + fix prompts)
 * - ci-check-pipeline.ts   (stage iteration, DB updates, deploy)
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';
import { type CIStage, type GeneratedFile } from './ci-check-validation.ts';
import {
  runStageWithRetries,
  completePipeline,
  captureStageFailures,
  type CIResults,
} from './ci-check-pipeline.ts';

/**
 * Run full CI validation on pipeline's generated code
 * Called after all code generation tasks are complete
 */
export async function runCICheck(pipelineId: string, requestId: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    await appendLog(supabase, pipelineId, 'error', 'ANTHROPIC_API_KEY not set — skipping CI');
    await completePipeline(supabase, pipelineId, requestId, null);
    return;
  }

  // Update pipeline to build_check stage
  await supabase
    .from('pipeline_runs')
    .update({ current_stage: 'build_check', last_heartbeat: new Date().toISOString() })
    .eq('id', pipelineId);

  await appendLog(
    supabase,
    pipelineId,
    'info',
    'Starting CI validation: TypeScript → ESLint → Tests'
  );

  // Collect all generated code
  const { data: tasks } = await supabase
    .from('implementation_task_items')
    .select('file_path, generated_code, title')
    .eq('request_id', requestId)
    .eq('implementation_status', 'completed')
    .not('generated_code', 'is', null);

  if (!tasks || tasks.length === 0) {
    await appendLog(supabase, pipelineId, 'warn', 'No generated code to validate');
    await completePipeline(supabase, pipelineId, requestId, null);
    return;
  }

  const files: GeneratedFile[] = tasks.map((t) => ({
    file_path: t.file_path,
    code: t.generated_code!,
    task_title: t.title,
  }));

  // Get feature context for validation
  const { data: pipeline } = await supabase
    .from('pipeline_runs')
    .select('feature_id')
    .eq('id', pipelineId)
    .single();

  const { data: feature } = await supabase
    .from('product_features')
    .select('title, description, acceptance_criteria')
    .eq('id', pipeline?.feature_id)
    .single();

  const anthropic = new Anthropic({ apiKey });
  const ciResults: CIResults = {
    typecheck: { passed: false, attempts: [] },
    lint: { passed: false, attempts: [] },
    test: { passed: false, attempts: [] },
  };

  const stages: CIStage[] = ['typecheck', 'lint', 'test'];
  let allPassed = true;

  for (const stage of stages) {
    // Check if pipeline was cancelled
    const { data: pipelineCheck } = await supabase
      .from('pipeline_runs')
      .select('status')
      .eq('id', pipelineId)
      .single();
    if (pipelineCheck?.status !== 'running') {
      await appendLog(supabase, pipelineId, 'warn', 'Pipeline cancelled during CI');
      return;
    }

    const passed = await runStageWithRetries(
      supabase,
      anthropic,
      pipelineId,
      requestId,
      stage,
      files,
      feature,
      ciResults[stage]
    );

    ciResults[stage].passed = passed;
    if (!passed) {
      allPassed = false;
      await appendLog(supabase, pipelineId, 'error', `${stage} failed after max attempts`);
      captureStageFailures(ciResults, stage, pipelineId, pipeline?.feature_id ?? '');
    }
  }

  // Save CI results and complete pipeline
  await supabase.from('pipeline_runs').update({ ci_results: ciResults }).eq('id', pipelineId);

  await completePipeline(supabase, pipelineId, requestId, allPassed);
}
