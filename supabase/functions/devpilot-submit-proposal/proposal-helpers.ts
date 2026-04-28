/**
 * Proposal submission helpers — test case generation, prototype attachment (FR-090)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

type SB = ReturnType<typeof createClient>;

interface TestCaseInput {
  title: string;
  type: 'api' | 'e2e';
  scenario: string;
}

interface ProposalTestCases {
  test_cases?: TestCaseInput[];
  acceptance_criteria: string[];
}

/** Generate test cases from proposal — prefer AI-generated, fall back to mechanical */
export function buildTestCases(
  proposal: ProposalTestCases,
  featureCode: string,
  featureId: string
): Record<string, unknown>[] {
  const testCasePrefix = featureCode.replace('FR-', 'TC-');

  if (proposal.test_cases && proposal.test_cases.length > 0) {
    return proposal.test_cases.map((tc, i) => {
      const num = String(i + 1).padStart(2, '0');
      const isHighPriority = /auth|payment|secur|block|restrict/i.test(tc.scenario);
      return {
        test_code: `${testCasePrefix}-${num}`,
        feature_id: featureId,
        title: tc.title.length > 100 ? tc.title.substring(0, 97) + '...' : tc.title,
        description: tc.scenario,
        test_type: tc.type === 'api' ? 'integration' : 'e2e',
        priority: isHighPriority ? 'high' : 'medium',
        status: 'draft',
        automated: false,
        automation_status: 'manual',
      };
    });
  }

  return proposal.acceptance_criteria.map((criterion, i) => {
    const num = String(i + 1).padStart(2, '0');
    let title = criterion;
    const thenMatch = title.match(/Then\s+(.+)/i);
    if (thenMatch) title = thenMatch[1];
    if (title.length > 100) title = title.substring(0, 97) + '...';
    const isEdgeCase =
      /unavailable|fail|error|invalid|no modules|no content|expires|malformed|blocked/i.test(
        criterion
      );
    const isHighPriority = /moderat|block|restrict|revok|auth|payment|secur/i.test(criterion);
    return {
      test_code: `${testCasePrefix}-${num}`,
      feature_id: featureId,
      title,
      description: criterion,
      test_type: isEdgeCase ? 'edge_case' : 'e2e',
      priority: isHighPriority ? 'high' : isEdgeCase ? 'medium' : 'high',
      status: 'draft',
      automated: false,
      automation_status: 'manual',
    };
  });
}

/** Attach prototype if one exists for this conversation (FR-140) */
export async function attachPrototype(
  supabase: SB,
  conversationId: string,
  featureId: string
): Promise<Record<string, unknown> | null> {
  const { data: currentProto } = await supabase
    .from('prototype_versions')
    .select('id, prototype_type, version_number')
    .eq('conversation_id', conversationId)
    .eq('is_current', true)
    .maybeSingle();

  if (!currentProto) return null;

  const { count: totalVersions } = await supabase
    .from('prototype_versions')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const renderUrl = `${supabaseUrl}/functions/v1/render-prototype?id=${currentProto.id}`;

  const { data: attachment } = await supabase
    .from('prototype_attachments')
    .insert({
      feature_id: featureId,
      prototype_version_id: currentProto.id,
      prototype_type: currentProto.prototype_type,
      render_url: renderUrl,
      total_versions: totalVersions ?? 1,
    })
    .select('id, prototype_type, render_url, total_versions')
    .single();

  return attachment ?? null;
}
