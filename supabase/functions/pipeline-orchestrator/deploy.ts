/** Autonomous Deployment Handler (FR-115 + FR-119 deploy mutex) */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import pg from 'npm:pg@8.13.1';
import { appendLog, onPipelineComplete } from './shared.ts';
import { runTestReadiness } from './test-readiness.ts';
import { waitForDeployLock, releaseDeployLock, detectFileConflicts } from './deploy-lock.ts';

const MAX_RETRIES = 3;

interface FixAttemptRecord { description: string; status: 'success' | 'failed'; error: string | null; timestamp: string; }
interface DeployStepResult { artifact: string; action: 'execute_sql' | 'deploy_function'; status: 'success' | 'failed' | 'skipped' | 'manual_override'; duration_ms: number; error: string | null; details: string | null; started_at: string | null; completed_at: string | null; retry_count: number; fix_attempts: FixAttemptRecord[]; }
interface DeployResults { migrations: DeployStepResult[]; functions: DeployStepResult[]; started_at: string; completed_at: string; overall_status: 'success' | 'partial' | 'failed'; }
interface GeneratedFile { file_path: string; code: string; }

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
      // Continue deployment — admin can review conflict report in dashboard
    }

    // FR-119: Acquire deploy lock (wait if another pipeline is deploying)
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

    // Step 1: Execute migrations (ordered by file path)
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

async function executeMigration(
  mig: GeneratedFile,
  pipelineId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<DeployStepResult> {
  const start = Date.now();
  const startedAt = new Date().toISOString();
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') ?? buildDbUrl();
  const fixAttempts: FixAttemptRecord[] = [];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      await client.query(mig.code);
      await client.end();
      return { artifact: mig.file_path, action: 'execute_sql', status: 'success', duration_ms: Date.now() - start, error: null, details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: attempt, fix_attempts: fixAttempts };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES - 1 && isTransient(msg)) {
        fixAttempts.push({ description: `Transient retry ${attempt + 1}`, status: 'failed', error: msg, timestamp: new Date().toISOString() });
        await appendLog(supabase, pipelineId, 'warn', `Migration retry ${attempt + 1}: ${msg}`);
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      fixAttempts.push({ description: `Final attempt ${attempt + 1}`, status: 'failed', error: msg, timestamp: new Date().toISOString() });
      return { artifact: mig.file_path, action: 'execute_sql', status: 'failed', duration_ms: Date.now() - start, error: msg, details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: attempt + 1, fix_attempts: fixAttempts };
    }
  }
  return { artifact: mig.file_path, action: 'execute_sql', status: 'failed', duration_ms: Date.now() - start, error: 'Max retries exceeded', details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: MAX_RETRIES, fix_attempts: fixAttempts };
}

async function deployFunction(
  slug: string,
  files: GeneratedFile[],
  pipelineId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<DeployStepResult> {
  const start = Date.now();
  const startedAt = new Date().toISOString();
  const fixAttempts: FixAttemptRecord[] = [];
  const accessToken = Deno.env.get('SB_ACCESS_TOKEN');
  if (!accessToken) {
    return { artifact: slug, action: 'deploy_function', status: 'failed', duration_ms: Date.now() - start, error: 'SB_ACCESS_TOKEN not set', details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: 0, fix_attempts: [] };
  }

  const projectRef = extractProjectRef();
  const entrypoint = files.find(f => f.file_path.endsWith('index.ts'))?.file_path ?? files[0]?.file_path;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/${slug}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          name: slug,
          verify_jwt: false,
          entrypoint_path: entrypoint,
          import_map: false,
        }),
      });

      if (resp.ok) {
        return { artifact: slug, action: 'deploy_function', status: 'success', duration_ms: Date.now() - start, error: null, details: `Deployed ${files.length} file(s)`, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: attempt, fix_attempts: fixAttempts };
      }

      const body = await resp.text();
      if (attempt < MAX_RETRIES - 1 && (resp.status >= 500 || resp.status === 429)) {
        fixAttempts.push({ description: `Transient retry ${attempt + 1} (HTTP ${resp.status})`, status: 'failed', error: body, timestamp: new Date().toISOString() });
        await appendLog(supabase, pipelineId, 'warn', `Function deploy retry ${attempt + 1}: ${resp.status}`);
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      fixAttempts.push({ description: `Final attempt ${attempt + 1}`, status: 'failed', error: `${resp.status}: ${body}`, timestamp: new Date().toISOString() });
      return { artifact: slug, action: 'deploy_function', status: 'failed', duration_ms: Date.now() - start, error: `${resp.status}: ${body}`, details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: attempt + 1, fix_attempts: fixAttempts };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES - 1 && isTransient(msg)) {
        fixAttempts.push({ description: `Network retry ${attempt + 1}`, status: 'failed', error: msg, timestamp: new Date().toISOString() });
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      fixAttempts.push({ description: `Final attempt ${attempt + 1}`, status: 'failed', error: msg, timestamp: new Date().toISOString() });
      return { artifact: slug, action: 'deploy_function', status: 'failed', duration_ms: Date.now() - start, error: msg, details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: attempt + 1, fix_attempts: fixAttempts };
    }
  }
  return { artifact: slug, action: 'deploy_function', status: 'failed', duration_ms: Date.now() - start, error: 'Max retries exceeded', details: null, started_at: startedAt, completed_at: new Date().toISOString(), retry_count: MAX_RETRIES, fix_attempts: fixAttempts };
}

function extractFunctionSlugs(files: GeneratedFile[]): string[] {
  const slugs = new Set<string>();
  for (const f of files) {
    const match = f.file_path.match(/^supabase\/functions\/([^/]+)\//);
    if (match) slugs.add(match[1]);
  }
  return [...slugs];
}

function extractProjectRef(): string {
  return new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname.split('.')[0];
}

function buildDbUrl(): string {
  return `postgresql://postgres.${extractProjectRef()}:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
}

function isTransient(msg: string): boolean {
  return ['ECONNRESET', 'timeout', 'ECONNREFUSED', '503', '429', 'overloaded'].some(t => msg.toLowerCase().includes(t.toLowerCase()));
}

async function completeDeploy(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string,
  results: DeployResults,
): Promise<void> {
  results.completed_at = new Date().toISOString();
  results.overall_status = 'success';

  // FR-119: Release deploy lock
  await releaseDeployLock(supabase, pipelineId);

  await supabase.from('pipeline_runs').update({
    status: 'completed',
    current_stage: 'deployed',
    current_task_id: null,
    deploy_results: results,
    completed_at: new Date().toISOString(),
  }).eq('id', pipelineId);

  await supabase.from('implementation_requests').update({
    status: 'implemented',
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);

  const migCount = results.migrations.filter(m => m.status === 'success').length;
  const fnCount = results.functions.filter(f => f.status === 'success').length;
  const summary = [migCount > 0 ? `${migCount} migration(s)` : '', fnCount > 0 ? `${fnCount} function(s)` : ''].filter(Boolean).join(', ') || 'no server-side artifacts';

  await appendLog(supabase, pipelineId, 'info', `Deployment complete: ${summary}`);

  // FR-116: Chain to test readiness after successful deploy
  try {
    await runTestReadiness(pipelineId, requestId);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Test readiness error: ${errMsg}`);
  }
}

async function failDeploy(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string,
  results: DeployResults,
): Promise<void> {
  results.completed_at = new Date().toISOString();

  // FR-142: Create escalation for the failed step
  const failedStep = [...results.migrations, ...results.functions].find(s => s.status === 'failed');
  if (failedStep && failedStep.retry_count >= MAX_RETRIES) {
    await supabase.from('deploy_escalations').insert({
      pipeline_id: pipelineId,
      step_type: failedStep.action === 'execute_sql' ? 'migration' : 'function',
      step_artifact: failedStep.artifact,
      error_message: failedStep.error ?? 'Unknown error',
      fix_attempts_count: failedStep.fix_attempts.length,
      fix_attempts_detail: failedStep.fix_attempts,
      status: 'open',
    });
    await appendLog(supabase, pipelineId, 'error', `SE Escalation created for ${failedStep.artifact}`);
  }

  // FR-119: Release deploy lock on failure
  await releaseDeployLock(supabase, pipelineId);

  await supabase.from('pipeline_runs').update({
    status: 'completed',
    current_stage: 'deploy_failed',
    current_task_id: null,
    deploy_results: results,
    completed_at: new Date().toISOString(),
  }).eq('id', pipelineId);

  await supabase.from('implementation_requests').update({
    status: 'completed',
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);

  await appendLog(supabase, pipelineId, 'warn', 'Deployment failed — manual intervention required');
}
