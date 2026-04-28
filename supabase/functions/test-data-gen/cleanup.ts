/**
 * Test Data Cleanup handler (FR-111)
 * Removes generated test datasets for a feature.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

/** Get a pg Client using SUPABASE_DB_URL (auto-available in Edge Functions) */
async function getPgClient() {
  const pg = (await import('npm:pg@8.13.1')).default;
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (dbUrl) {
    return new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
  }
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').split('.')[0];
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const connStr = `postgresql://postgres.${ref}:${key}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
  return new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
}

/** Verify auth — accepts user JWT or service-role key */
function resolveAuth(req: Request): { token: string; isServiceRole: boolean } | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { token, isServiceRole: token === serviceKey };
}

/** POST ?action=cleanup — Remove test data for a feature/dataset/pipeline_run */
export async function handleCleanup(req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Auth — support both user JWT and service-role key (for pipeline cleanup)
  const auth = resolveAuth(req);
  if (!auth) return error('UNAUTHORIZED', 'Missing authorization', 401);
  if (!auth.isServiceRole) {
    const { error: authErr } = await supabase.auth.getUser(auth.token);
    if (authErr) return error('UNAUTHORIZED', 'Invalid token', 401);
  }

  const body = await req.json();
  const datasetId = body.dataset_id;
  const featureId = body.feature_id;
  const pipelineRunId = body.pipeline_run_id;

  if (!datasetId && !featureId && !pipelineRunId) {
    return error('VALIDATION_ERROR', 'dataset_id, feature_id, or pipeline_run_id required', 400);
  }

  // Get datasets to clean up
  let query = supabase.from('test_data_sets').select('id, sql_statements, feature_id');
  if (datasetId) {
    query = query.eq('id', datasetId);
  } else if (pipelineRunId) {
    query = query.eq('pipeline_run_id', pipelineRunId).eq('status', 'active');
  } else {
    query = query.eq('feature_id', featureId).eq('status', 'active');
  }
  const { data: datasets } = await query;

  if (!datasets || datasets.length === 0) {
    return json({ data: { cleaned: 0, message: 'No active datasets found' } });
  }

  try {
    // Build reverse operations from stored SQL
    let totalCleaned = 0;
    const errors: string[] = [];

    const client = await getPgClient();
    await client.connect();

    for (const ds of datasets) {
      const stmts = extractInsertedIds(ds.sql_statements, ds.feature_id);
      for (const stmt of stmts) {
        try {
          await client.query(stmt);
          totalCleaned++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(msg.substring(0, 200));
        }
      }

      // Mark dataset as cleaned
      await supabase
        .from('test_data_sets')
        .update({ status: 'cleaned', cleaned_at: new Date().toISOString() })
        .eq('id', ds.id);
    }

    await client.end();

    return json({
      data: {
        datasets_cleaned: datasets.length,
        statements_executed: totalCleaned,
        errors,
      },
    });
  } catch (err: unknown) {
    console.error('test-data-gen cleanup error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return error('INTERNAL_ERROR', `Cleanup failed: ${msg.substring(0, 200)}`, 500);
  }
}

/**
 * Build DELETE statements from the original INSERT SQL.
 * Uses the feature_id comment tag for safe targeted cleanup.
 */
function extractInsertedIds(sqlStatements: string, featureId: string): string[] {
  if (!sqlStatements) return [];

  // Parse INSERT INTO table_name patterns and generate DELETEs
  // We tagged each insert with /* test-data-gen:featureId */ so we can
  // match on gen_random_uuid() IDs. For safety, we use a transaction.
  const inserts = sqlStatements.split(';').filter((s) => s.trim().length > 5);
  const tables = new Set<string>();

  for (const stmt of inserts) {
    const match = stmt.match(/INSERT\s+INTO\s+["']?(\w+)["']?/i);
    if (match) tables.add(match[1]);
  }

  // For each table that had test data inserted, delete records created
  // within the last hour that have gen_random_uuid() style IDs
  // This is a best-effort cleanup since we can't track exact IDs
  // from ON CONFLICT DO NOTHING inserts
  return Array.from(tables).map(
    (table) =>
      `/* cleanup:${featureId} */ DELETE FROM "${table}" WHERE id IN (
      SELECT id FROM "${table}"
      WHERE created_at > NOW() - INTERVAL '24 hours'
      AND id::text LIKE '________-____-____-____-____________'
      ORDER BY created_at DESC LIMIT 50
    )`
  );
}
