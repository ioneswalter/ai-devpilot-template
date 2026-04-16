/**
 * Test Data Generation handler (FR-111)
 * Uses AI to generate realistic, feature-specific test data and executes it.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';
import { getDataModelContext, buildSpecContext, GENERATE_PROMPT } from './helpers.ts';

// Use Haiku for speed — test data generation is simple SQL, doesn't need Sonnet
const AI_MODEL = 'claude-haiku-4-5-20251001';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/**
 * Get a pg Client using the built-in SUPABASE_DB_URL (available inside Edge Functions).
 * Falls back to constructing from SUPABASE_URL + SERVICE_ROLE_KEY if needed.
 */
async function getPgClient() {
  const pg = (await import('npm:pg@8.13.1')).default;
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (dbUrl) {
    return new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
  }
  // Fallback: construct from available env vars
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').split('.')[0];
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const connStr = `postgresql://postgres.${ref}:${key}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
  return new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
}

type TriggerSource = 'manual' | 'copilot' | 'pipeline';

/** Verify auth — accepts user JWT or service-role key */
function resolveAuth(req: Request): { token: string; isServiceRole: boolean } | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { token, isServiceRole: token === serviceKey };
}

/** POST ?action=generate — Generate test data for a feature */
export async function handleGenerate(req: Request): Promise<Response> {
  const supabase = getSupabase();

  // Auth — support both user JWT and service-role key (for pipeline/copilot)
  const auth = resolveAuth(req);
  if (!auth) return error('UNAUTHORIZED', 'Missing authorization', 401);

  let userId = 'service-role';
  if (!auth.isServiceRole) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.token);
    if (authErr || !user) return error('UNAUTHORIZED', 'Invalid token', 401);
    userId = user.id;
  }

  // Resolve admin user ID for test data templates — templates need a real user ID
  // so browser-interactive data (enrollments, progress) belongs to the logged-in admin.
  // Falls back to the super_admin from admin_users when called via service-role (pipeline/copilot).
  let adminUserId = userId;
  if (userId === 'service-role') {
    const { data: admin } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('role', 'super_admin')
      .limit(1)
      .maybeSingle();
    adminUserId = admin?.user_id ?? 'service-role';
  }

  const body = await req.json();
  const featureId = body.feature_id;
  const triggerSource: TriggerSource = body.trigger_source ?? 'manual';
  const pipelineRunId: string | null = body.pipeline_run_id ?? null;
  if (!featureId) return error('VALIDATION_ERROR', 'feature_id required', 400);
  if (pipelineRunId && triggerSource !== 'pipeline') {
    return error('VALIDATION_ERROR', 'pipeline_run_id requires trigger_source=pipeline', 400);
  }

  // Get feature context
  const { data: feature } = await supabase
    .from('product_features')
    .select('id, feature_code, title, description, acceptance_criteria, category')
    .eq('id', featureId)
    .single();

  if (!feature) return error('NOT_FOUND', 'Feature not found', 404);

  // Skip test data generation for toolkit/infrastructure features — they have no data model
  if (feature.category === 'toolkit') {
    const datasetId = crypto.randomUUID();
    await supabase.from('test_data_sets').upsert({
      id: datasetId,
      feature_id: featureId,
      generated_by: userId,
      sql_statements: '-- Toolkit feature: no test data needed',
      records_created: 0,
      status: 'active',
      trigger_source: triggerSource,
      pipeline_run_id: pipelineRunId,
      created_at: new Date().toISOString(),
    });
    return json({
      data: {
        dataset_id: datasetId,
        feature_code: feature.feature_code,
        records_created: 0,
        total_statements: 0,
        errors: [],
        status: 'success',
        trigger_source: triggerSource,
        pipeline_run_id: pipelineRunId,
        skipped_reason: 'Toolkit feature — no data model to seed',
      },
    });
  }

  try {
    // Check for a pre-built template first (reliable, no AI guessing)
    const { getTemplate } = await import('./templates.ts');
    const template = getTemplate(feature.feature_code, adminUserId);

    let sqlText: string;
    let usedTemplate = false;

    if (template) {
      // Use pre-built SQL — no AI needed
      sqlText = template.join(';\n');
      usedTemplate = true;
      console.log(`test-data-gen: using template for ${feature.feature_code}`);
    } else {
      // Fall back to AI generation for features without templates
      const criteria = (feature.acceptance_criteria as string[]) || [];
      const specContext = buildSpecContext(feature.title, feature.description, criteria);

      // Try to load data-model.md for targeted schema context instead of full DB dump
      const dataModelContext = await getDataModelContext(featureId, supabase);
      const schemaHint = dataModelContext || await getSchemaHint();

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) return error('AI_ERROR', 'AI service not configured', 500);

      const Anthropic = (await import('npm:@anthropic-ai/sdk@0.39.0')).default;
      const anthropic = new Anthropic({ apiKey, timeout: 25_000 });
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 2048,
        system: GENERATE_PROMPT,
        messages: [{ role: 'user', content: `${specContext}\n\n${schemaHint}` }],
      });

      const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
      sqlText = textBlock && textBlock.type === 'text'
        ? (textBlock as { type: 'text'; text: string }).text.trim()
        : '';

      // Log AI usage (fire-and-forget)
      logAIUsage(supabase, {
        featureId, adminId: userId, modelId: AI_MODEL,
        operationType: 'test_data_gen',
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      }).catch(() => {});
    }

    if (!sqlText || sqlText.length < 10) {
      return error('AI_ERROR', 'AI returned empty data', 500);
    }

    // Execute SQL — template array or AI-generated text
    const result = await executeSql(usedTemplate ? template! : sqlText, featureId);

    // Store dataset metadata for cleanup
    const datasetId = crypto.randomUUID();
    await supabase.from('test_data_sets').upsert({
      id: datasetId,
      feature_id: featureId,
      generated_by: userId,
      sql_statements: sqlText,
      records_created: result.inserted,
      status: result.errors.length === 0 ? 'active' : 'partial',
      trigger_source: triggerSource,
      pipeline_run_id: pipelineRunId,
      created_at: new Date().toISOString(),
    });

    return json({
      data: {
        dataset_id: datasetId,
        feature_code: feature.feature_code,
        records_created: result.inserted,
        total_statements: result.total,
        errors: result.errors,
        status: result.errors.length === 0 ? 'success' : 'partial',
        trigger_source: triggerSource,
        pipeline_run_id: pipelineRunId,
      },
    });
  } catch (err: unknown) {
    console.error('test-data-gen generate error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return error('AI_ERROR', `Generation failed: ${msg.substring(0, 200)}`, 500);
  }
}

/** GET ?action=list — List generated datasets for a feature */
export async function handleList(req: Request): Promise<Response> {
  const supabase = getSupabase();

  const auth = resolveAuth(req);
  if (!auth) return error('UNAUTHORIZED', 'Missing authorization', 401);
  if (!auth.isServiceRole) {
    const { error: authErr } = await supabase.auth.getUser(auth.token);
    if (authErr) return error('UNAUTHORIZED', 'Invalid token', 401);
  }

  const url = new URL(req.url);
  const featureId = url.searchParams.get('feature_id');
  if (!featureId) return error('VALIDATION_ERROR', 'feature_id required', 400);

  const { data: datasets } = await supabase
    .from('test_data_sets')
    .select('id, feature_id, generated_by, records_created, status, trigger_source, created_at')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false })
    .limit(20);

  return json({ data: datasets ?? [] });
}

// ── Helpers ──

// buildSpecContext, getDataModelContext, GENERATE_PROMPT imported from helpers.ts

async function getSchemaHint(): Promise<string> {
  try {
    const client = await getPgClient();
    await client.connect();
    const res = await client.query(`
      SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
             c.column_default
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON c.table_name = t.table_name AND c.table_schema = t.table_schema
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `);
    await client.end();

    // Group columns by table: "table_name(col1 type, col2 type, ...)"
    type ColRow = { table_name: string; column_name: string; data_type: string; column_default: string | null };
    const tables = new Map<string, string[]>();
    for (const r of res.rows as ColRow[]) {
      if (!tables.has(r.table_name)) tables.set(r.table_name, []);
      const defaultHint = r.column_default ? ' DEFAULT' : '';
      tables.get(r.table_name)!.push(`${r.column_name} ${r.data_type}${defaultHint}`);
    }

    const lines = Array.from(tables.entries())
      .map(([t, cols]) => `${t}(${cols.join(', ')})`)
      .join('\n');
    return `Database schema:\n${lines}`;
  } catch (err) {
    console.warn('getSchemaHint failed (non-fatal):', err instanceof Error ? err.message : err);
    return '';
  }
}

/** Execute SQL statements against the database. Accepts raw text or pre-split array. */
async function executeSql(input: string | string[], featureId: string) {
  const client = await getPgClient();
  await client.connect();

  const statements = Array.isArray(input)
    ? input
    : input.replace(/```sql?\s*/gi, '').replace(/```/g, '').trim()
        .split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 5);

  let inserted = 0;
  const errors: string[] = [];

  for (const stmt of statements) {
    try {
      await client.query(`/* test-data-gen:${featureId} */ ${stmt}`);
      inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg.substring(0, 200));
    }
  }

  await client.end();
  return { inserted, total: statements.length, errors };
}

// GENERATE_PROMPT imported from helpers.ts
