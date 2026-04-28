/**
 * Test Readiness — Test Case Generation step (FR-116)
 * Uses AI to generate test cases from feature spec context
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';
import { appendLog } from './shared.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export interface TestCaseResult {
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  errors: string[];
  created: number;
  skipped: number;
}

export async function generateTestCases(
  supabase: SupabaseClient,
  pipelineId: string,
  featureId: string,
  feature: Record<string, unknown> | null,
  specContext: string
): Promise<TestCaseResult> {
  const start = Date.now();
  if (!specContext || specContext.length < 20) {
    await appendLog(supabase, pipelineId, 'warn', 'No spec context for test cases — skipping');
    return {
      status: 'skipped',
      duration_ms: Date.now() - start,
      errors: [],
      created: 0,
      skipped: 0,
    };
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return {
        status: 'skipped',
        duration_ms: Date.now() - start,
        errors: ['ANTHROPIC_API_KEY not set'],
        created: 0,
        skipped: 0,
      };
    }

    const anthropic = new Anthropic({ apiKey });
    const featureCode = (feature?.feature_code ?? 'FR-XXX') as string;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Given this feature context, generate test cases as a JSON array. Each test case should cover a user journey or acceptance scenario.

Feature context:
${specContext}

Return a JSON array (no markdown fences) where each object has:
- "title": short test case title (max 80 chars)
- "description": what to test
- "test_type": "e2e"
- "priority": "high" or "medium"
- "expected_result": what success looks like

Generate 4-10 test cases covering the main user journeys and edge cases.`,
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
    const rawJson = (msg.content[0] as { text: string }).text.trim();

    const testCases = parseTestCasesJson(rawJson);

    // Check for existing test cases to avoid duplicates
    const { data: existing } = await supabase
      .from('test_cases')
      .select('title')
      .eq('feature_id', featureId);

    const existingTitles = new Set(
      (existing ?? []).map((t: { title: string }) => t.title.toLowerCase())
    );

    let created = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      if (existingTitles.has(tc.title.toLowerCase())) {
        skippedCount++;
        continue;
      }

      const testCode = `${featureCode}-TC${String(i + 1).padStart(2, '0')}`;
      const { error } = await supabase.from('test_cases').insert({
        test_code: testCode,
        feature_id: featureId,
        title: tc.title,
        description: tc.description,
        test_type: tc.test_type || 'e2e',
        priority: tc.priority || 'medium',
        expected_result: tc.expected_result,
        status: 'draft',
        created_by: 'ai-pipeline',
      });

      if (error) {
        if (error.message?.includes('duplicate')) {
          skippedCount++;
        } else {
          errors.push(`${tc.title}: ${error.message}`);
        }
      } else {
        created++;
      }
    }

    await appendLog(
      supabase,
      pipelineId,
      'info',
      `Test cases: ${created} created, ${skippedCount} skipped (existing)`
    );

    return {
      status:
        created > 0 || skippedCount > 0 ? 'success' : errors.length > 0 ? 'failed' : 'skipped',
      duration_ms: Date.now() - start,
      errors,
      created,
      skipped: skippedCount,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Test case generation failed: ${errMsg}`);
    return {
      status: 'failed',
      duration_ms: Date.now() - start,
      errors: [errMsg],
      created: 0,
      skipped: 0,
    };
  }
}

function parseTestCasesJson(rawJson: string): Array<{
  title: string;
  description: string;
  test_type: string;
  priority: string;
  expected_result: string;
}> {
  try {
    return JSON.parse(rawJson);
  } catch {
    const match = rawJson.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('AI did not return valid JSON array');
    return JSON.parse(match[0]);
  }
}
