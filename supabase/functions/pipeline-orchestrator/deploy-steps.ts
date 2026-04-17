/** Deploy step execution: migrations and Edge Functions (FR-115) */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import pg from 'npm:pg@8.13.1';
import { appendLog } from './shared.ts';

const MAX_RETRIES = 3;

interface FixAttemptRecord {
  description: string;
  status: 'success' | 'failed';
  error: string | null;
  timestamp: string;
}

export interface DeployStepResult {
  artifact: string;
  action: 'execute_sql' | 'deploy_function';
  status: 'success' | 'failed' | 'skipped' | 'manual_override';
  duration_ms: number;
  error: string | null;
  details: string | null;
  started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  fix_attempts: FixAttemptRecord[];
}

export interface GeneratedFile {
  file_path: string;
  code: string;
}

function extractProjectRef(): string {
  return new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname.split('.')[0];
}

function buildDbUrl(): string {
  return `postgresql://postgres.${extractProjectRef()}:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
}

function isTransient(msg: string): boolean {
  return ['ECONNRESET', 'timeout', 'ECONNREFUSED', '503', '429', 'overloaded']
    .some(t => msg.toLowerCase().includes(t.toLowerCase()));
}

export function extractFunctionSlugs(files: GeneratedFile[]): string[] {
  const slugs = new Set<string>();
  for (const f of files) {
    const match = f.file_path.match(/^supabase\/functions\/([^/]+)\//);
    if (match) slugs.add(match[1]);
  }
  return [...slugs];
}

export async function executeMigration(
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

export async function deployFunction(
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
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: slug, verify_jwt: false, entrypoint_path: entrypoint, import_map: false }),
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
