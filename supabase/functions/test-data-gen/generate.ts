/**
 * Test Data Generation handler (FR-111)
 * Uses AI to generate realistic, feature-specific test data and executes it.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import pg from 'npm:pg@8.13.1';
import { corsHeaders } from '../_shared/cors.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';

const AI_MODEL = 'claude-sonnet-4-6';

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

function buildDbUrl(): string {
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').split('.')[0];
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return `postgresql://postgres.${ref}:${key}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
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
    .select('id, feature_code, title, description, acceptance_criteria')
    .eq('id', featureId)
    .single();

  if (!feature) return error('NOT_FOUND', 'Feature not found', 404);

  const criteria = (feature.acceptance_criteria as string[]) || [];
  const specContext = buildSpecContext(feature.title, feature.description, criteria);

  // Get existing table schema for context
  const schemaHint = await getSchemaHint();

  // Generate test data via AI
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return error('AI_ERROR', 'AI service not configured', 500);

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    system: GENERATE_PROMPT,
    messages: [{ role: 'user', content: `${specContext}\n\n${schemaHint}` }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const sqlText = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';

  // Log AI usage (fire-and-forget)
  logAIUsage(supabase, {
    featureId, adminId: userId, modelId: AI_MODEL,
    operationType: 'test_data_gen',
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }).catch(() => {});

  if (!sqlText || sqlText.length < 10) {
    return error('AI_ERROR', 'AI returned empty data', 500);
  }

  // Parse and execute SQL
  const result = await executeSql(sqlText, featureId);

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
    .select('id, feature_id, generated_by, records_created, status, created_at')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false })
    .limit(20);

  return json({ data: datasets ?? [] });
}

// ── Helpers ──

function buildSpecContext(title: string, description: string | null, criteria: string[]): string {
  const parts = [`Feature: ${title}`];
  if (description) parts.push(`Description: ${description}`);
  if (criteria.length > 0) {
    parts.push('Acceptance Criteria:\n' + criteria.map((c, i) => `${i + 1}. ${c}`).join('\n'));
  }
  return parts.join('\n\n');
}

async function getSchemaHint(): Promise<string> {
  try {
    const client = new pg.Client({ connectionString: buildDbUrl(), ssl: { rejectUnauthorized: false } });
    await client.connect();
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    await client.end();
    const tables = res.rows.map((r: { table_name: string }) => r.table_name).join(', ');
    return `Available database tables: ${tables}`;
  } catch {
    return '';
  }
}

async function executeSql(sqlText: string, featureId: string) {
  const client = new pg.Client({ connectionString: buildDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Strip markdown fences if present
  const cleaned = sqlText.replace(/```sql?\s*/gi, '').replace(/```/g, '').trim();
  const statements = cleaned.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 5);

  let inserted = 0;
  const errors: string[] = [];

  for (const stmt of statements) {
    try {
      // Add feature tag comment for traceability
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

const GENERATE_PROMPT = `You are a test data generator for a gig economy platform (OwnYourGig). Generate realistic SQL INSERT statements for testing the described feature.

Rules:
- Return ONLY valid PostgreSQL SQL — no markdown fences, no explanations
- Use gen_random_uuid() for UUID primary keys
- Use ON CONFLICT DO NOTHING for idempotent inserts
- Generate 5-10 realistic records relevant to the feature
- Include realistic Australian names, addresses, phone numbers, ABNs
- Never use real PII — all data must be fictional but realistic
- Maintain referential integrity across related tables
- Include diverse data: different states, amounts, dates, categories
- Each statement on its own line ending with semicolon
- Only target tables that exist in the provided schema list`;
