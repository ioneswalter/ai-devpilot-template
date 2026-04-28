/**
 * Test Readiness — Seed Data step (FR-116)
 * Generates and executes test seed data using AI
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';
import pg from 'npm:pg@8.13.1';
import { appendLog } from './shared.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export interface SeedDataResult {
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  errors: string[];
  records: number;
}

export function buildDbUrl(): string {
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').split('.')[0];
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return `postgresql://postgres.${ref}:${key}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
}

export async function seedTestData(
  supabase: SupabaseClient,
  pipelineId: string,
  _featureId: string,
  specContext: string
): Promise<SeedDataResult> {
  const start = Date.now();
  if (!specContext || specContext.length < 20) {
    await appendLog(supabase, pipelineId, 'warn', 'No spec context for seed data — skipping');
    return { status: 'skipped', duration_ms: Date.now() - start, errors: [], records: 0 };
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return {
        status: 'skipped',
        duration_ms: Date.now() - start,
        errors: ['ANTHROPIC_API_KEY not set'],
        records: 0,
      };
    }

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Given this feature context, generate realistic test data as a series of SQL INSERT statements that would help test the feature. Only generate INSERTs for tables that likely exist in a Supabase PostgreSQL database for a gig platform (service providers, customers, jobs, etc). Each INSERT must be idempotent (use ON CONFLICT DO NOTHING where possible). Return ONLY valid SQL, no markdown fences or explanation.

Feature context:
${specContext}

Requirements:
- Generate 3-8 realistic test records
- Use UUIDs for IDs (use gen_random_uuid())
- Include realistic data (names, descriptions, amounts)
- Target tables: product_features, test_cases, or domain tables mentioned in context
- Each statement on its own line, ending with semicolon`,
        },
      ],
    });

    logAIUsageFromEnv({
      featureId: 'pipeline',
      adminId: 'system',
      modelId: 'claude-sonnet-4-6',
      operationType: 'test_readiness',
      inputTokens: msg.usage?.input_tokens ?? 0,
      outputTokens: msg.usage?.output_tokens ?? 0,
    });
    const sqlText = (msg.content[0] as { text: string }).text.trim();
    if (!sqlText || sqlText.length < 10) {
      return {
        status: 'skipped',
        duration_ms: Date.now() - start,
        errors: ['AI returned empty SQL'],
        records: 0,
      };
    }

    // Execute via npm:pg
    const dbUrl = buildDbUrl();
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();

    const statements = sqlText
      .split(';')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 5);
    let inserted = 0;
    const errors: string[] = [];

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        inserted++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(errMsg.substring(0, 200));
      }
    }

    await client.end();
    await appendLog(
      supabase,
      pipelineId,
      'info',
      `Seed data: ${inserted}/${statements.length} records inserted`
    );

    return {
      status: errors.length === 0 ? 'success' : inserted > 0 ? 'success' : 'failed',
      duration_ms: Date.now() - start,
      errors,
      records: inserted,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Seed data failed: ${errMsg}`);
    return { status: 'failed', duration_ms: Date.now() - start, errors: [errMsg], records: 0 };
  }
}
