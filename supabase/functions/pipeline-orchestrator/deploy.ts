/** Autonomous Deployment Handler (FR-115 + FR-119 deploy mutex) */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';
import { waitForDeployLock, detectFileConflicts } from './deploy-lock.ts';
import {
  executeMigration,
  deployFunction,
  extractFunctionSlugs,
  type GeneratedFile,
} from './deploy-steps.ts';
import {
  completeDeploy,
  failDeploy,
  type DeployResults,
} from './deploy-lifecycle.ts';

export async function runDeploy(pipelineId: string, requestId: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  await supabase.from('pipeline_runs').update({
    current_stage: 'deploying',
    last_heartbeat: new Date().toISOString(),
  }).eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'info', 'Starting autonomous deployment');

  const results: DeployResults = {
    migrations: [],
    functions: [],
    started_at: new Date().toISOString(),
    completed_at: '',
    overall_status: 'success',
  };

  try {
    // Collect generated code
    const { data: tasks } = await supabase
      .from('implementation_task_items')
      .select('file_path, generated_code')
      .eq('request_id', requestId)
      .eq('implementation_status', 'completed')
      .not('generated_code', 'is', null);

    if (!tasks || tasks.length === 0) {
      await appendLog(supabase, pipelineId, 'info', 'No generated code — skipping deployment');
      await completeDeploy(supabase, pipelineId, requestId, results);
      return;
    }

    const files: GeneratedFile[] = tasks.map(t => ({ file_path: t.file_path, code: t.generated_code! }));

    // FR-119: Detect file conflicts with other concurrent pipelines
    const conflicts = await detectFileConflicts(supabase, pipelineId, requestId);
    if (conflicts.length > 0) {
      await supabase.from('pipeline_runs').update({
        conflict_report: { conflicts, detected_at: new Date().toISOString(), status: 'pending' },
      }).eq('id', pipelineId);
      await appendLog(supabase, pipelineId, 'warn', `File conflicts detected: ${conflicts.length} file(s) overlap with other pipelines`);
    }

    // FR-119: Acquire deploy lock
    const { data: pipeline } = await supabase.from('pipeline_runs').select('feature_id').eq('id', pipelineId).single();
    const lockAcquired = await waitForDeployLock(supabase, pipelineId, pipeline?.feature_id ?? '');
    if (!lockAcquired) {
      results.overall_status = 'failed';
      await appendLog(supabase, pipelineId, 'error', 'Failed to acquire deployment slot — pipeline may have been cancelled or timed out');
      await failDeploy(supabase, pipelineId, requestId, results);
      return;
    }
    await supabase.from('pipeline_runs').update({ waiting_for_deploy: false }).eq('id', pipelineId);

    // Classify artifacts
    const migrations = files.filter(f => f.file_path.includes('migrations/') && f.file_path.endsWith('.sql'));
    const edgeFunctions = files.filter(f => f.file_path.startsWith('supabase/functions/'));

    if (migrations.length === 0 && edgeFunctions.length === 0) {
      await appendLog(supabase, pipelineId, 'info', 'No server-side artifacts — deployment skipped');
      await completeDeploy(supabase, pipelineId, requestId, results);
      return;
    }

    // Step 1: Execute migrations
    if (migrations.length > 0) {
      const sorted = migrations.sort((a, b) => a.file_path.localeCompare(b.file_path));
      await appendLog(supabase, pipelineId, 'info', `Applying ${sorted.length} migration(s)...`);

      for (const mig of sorted) {
        const result = await executeMigration(mig, pipelineId, supabase);
        results.migrations.push(result);
        if (result.status === 'failed') {
          results.overall_status = 'failed';
          await appendLog(supabase, pipelineId, 'error', `Migration failed: ${mig.file_path} — ${result.error}`);
          await failDeploy(supabase, pipelineId, requestId, results);
          return;
        }
        await appendLog(supabase, pipelineId, 'info', `Migration applied: ${mig.file_path}`);
      }
    }

    // Step 2: Deploy Edge Functions
    if (edgeFunctions.length > 0) {
      const slugs = extractFunctionSlugs(edgeFunctions);
      await appendLog(supabase, pipelineId, 'info', `Deploying ${slugs.length} Edge Function(s)...`);

      for (const slug of slugs) {
        const fnFiles = edgeFunctions.filter(f => f.file_path.startsWith(`supabase/functions/${slug}/`));
        const result = await deployFunction(slug, fnFiles, pipelineId, supabase);
        results.functions.push(result);
        if (result.status === 'failed') {
          results.overall_status = results.migrations.some(m => m.status === 'success') ? 'partial' : 'failed';
          await appendLog(supabase, pipelineId, 'error', `Function deploy failed: ${slug} — ${result.error}`);
          await failDeploy(supabase, pipelineId, requestId, results);
          return;
        }
        await appendLog(supabase, pipelineId, 'info', `Function deployed: ${slug}`);
      }
    }

    await completeDeploy(supabase, pipelineId, requestId, results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown deployment error';
    results.overall_status = 'failed';
    results.completed_at = new Date().toISOString();
    await appendLog(supabase, pipelineId, 'error', `Deployment error: ${msg}`);
    await failDeploy(supabase, pipelineId, requestId, results);
  }
}
