/**
 * DevPilot Submit Proposal Edge Function
 * POST: Submit a finalized proposal, creating a new product feature
 *
 * FR-090 Feature Ideation Chat
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import { performDedupCheck } from '../_shared/dedup-check.ts';
import { generateSpecMarkdown, extractResearchNotes } from '../_shared/speckit-generator.ts';
import type { SpecKitProposal } from '../_shared/speckit-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

const journeySchema = z.object({
  title: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']),
  description: z.string().min(1),
  why_priority: z.string().optional(),
  independent_test: z.string().optional(),
  acceptance_scenarios: z.array(z.string()).min(1),
});

const proposalSchema = z.object({
  conversation_id: z.string().min(1),
  proposal: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().min(1, 'Description is required'),
    acceptance_criteria: z.array(z.string()).min(1, 'At least one criterion required'),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    category: z.enum(['toolkit', 'business_module']).nullable().optional(),
    spec_section: z.string().optional(),
    // SpecKit journey data (optional — backward compatible)
    journeys: z.array(journeySchema).optional(),
    edge_cases: z.array(z.string()).optional(),
    success_criteria: z.array(z.string()).optional(),
    problem_statement: z.string().optional(),
    solution: z.string().optional(),
  }),
});


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests allowed', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
    if (authErr || !user) return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Validate request — sanitise category before validation
    const body = await req.json();
    if (body?.proposal?.category === 'null' || body?.proposal?.category === '') {
      body.proposal.category = null;
    }
    const validation = proposalSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
    }

    const { conversation_id, proposal } = validation.data;

    // Verify conversation
    const { data: conv, error: convErr } = await supabase
      .from('ideation_conversations')
      .select('id, status, created_by, submitted_feature_id')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) return errorResponse('NOT_FOUND', 'Conversation not found', 404);
    if (conv.created_by !== user.id && !isAdmin) {
      return errorResponse('FORBIDDEN', 'You do not have access to this conversation', 403);
    }
    // Allow multiple proposals from the same conversation (multi-proposal flow)
    // Only block if conversation was explicitly cancelled
    if (conv.status === 'cancelled') {
      return errorResponse('VALIDATION_ERROR', 'Conversation has been cancelled', 400);
    }

    // Apply defaults for member proposals
    const priority = proposal.priority ?? 'P3';
    const category = proposal.category ?? null;
    const specSection = proposal.spec_section ?? 'Community Proposals';

    // Generate next feature code
    const { data: maxFeature } = await supabase
      .from('product_features')
      .select('feature_code')
      .like('feature_code', 'FR-%')
      .order('feature_code', { ascending: false })
      .limit(1)
      .single();

    let nextNumber = 1;
    if (maxFeature?.feature_code) {
      const match = maxFeature.feature_code.match(/FR-(\d+)/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }
    const featureCode = `FR-${String(nextNumber).padStart(3, '0')}`;

    // Dedup check
    const { data: allFeatures } = await supabase
      .from('product_features')
      .select('feature_code, title, description, status');

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    const dedupResult = await performDedupCheck(
      proposal,
      (allFeatures ?? []) as Array<{ feature_code: string; title: string; description: string; status: string }>,
      anthropicApiKey
    );

    // Generate SpecKit artifacts from proposal + conversation
    const specMarkdown = generateSpecMarkdown(proposal as SpecKitProposal, featureCode);

    // Fetch conversation messages for research notes
    const { data: convMessages } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(50);

    const researchMarkdown = extractResearchNotes(
      (convMessages ?? []) as Array<{ role: string; content: string }>,
      proposal.title,
    );

    // Create feature
    const { data: feature, error: createErr } = await supabase
      .from('product_features')
      .insert({
        feature_code: featureCode,
        title: proposal.title,
        description: proposal.description,
        acceptance_criteria: proposal.acceptance_criteria,
        priority,
        category,
        status: 'proposed',
        feature_type: 'functional_requirement',
        spec_section: specSection,
        ideation_conversation_id: conversation_id,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select('id, feature_code, title, status, priority, category')
      .single();

    if (createErr) {
      console.error('Create feature error:', createErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to create feature', 500);
    }

    // Store SpecKit artifacts (spec.md + research.md) in feature_spec_artifacts
    const now = new Date().toISOString();
    const artifacts = [
      {
        feature_id: feature.id,
        artifact_type: 'spec',
        file_name: 'spec.md',
        content: specMarkdown,
        synced_at: now,
      },
      {
        feature_id: feature.id,
        artifact_type: 'research',
        file_name: 'research.md',
        content: researchMarkdown,
        synced_at: now,
      },
    ];

    const { error: artifactErr } = await supabase
      .from('feature_spec_artifacts')
      .insert(artifacts);

    if (artifactErr) {
      // Non-blocking: log but don't fail the submission
      console.error('Failed to save SpecKit artifacts:', artifactErr);
    }

    // Generate test cases from acceptance criteria (non-blocking)
    const testCasePrefix = featureCode.replace('FR-', 'TC-');
    const testCases = proposal.acceptance_criteria.map((criterion, i) => {
      const num = String(i + 1).padStart(2, '0');
      // Derive title from Then clause or first 100 chars
      let title = criterion;
      const thenMatch = title.match(/Then\s+(.+)/i);
      if (thenMatch) title = thenMatch[1];
      if (title.length > 100) title = title.substring(0, 97) + '...';

      const isEdgeCase = /unavailable|fail|error|invalid|no modules|no content|expires|malformed|blocked/i.test(criterion);
      const isHighPriority = /moderat|block|restrict|revok|auth|payment|secur/i.test(criterion);

      return {
        test_code: `${testCasePrefix}-${num}`,
        feature_id: feature.id,
        title,
        description: criterion,
        test_type: isEdgeCase ? 'edge_case' : 'e2e',
        priority: isHighPriority ? 'high' : (isEdgeCase ? 'medium' : 'high'),
        status: 'draft',
        automated: false,
        automation_status: 'manual',
      };
    });

    if (testCases.length > 0) {
      const { error: tcErr } = await supabase.from('test_cases').insert(testCases);
      if (tcErr) console.error('Failed to create test cases:', tcErr);
    }

    // Update conversation — keep first submitted feature as the primary link
    // Status stays 'draft' to allow multi-proposal flow; set to 'submitted' only on first submission
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (!conv.submitted_feature_id) {
      updateData.status = 'submitted';
      updateData.submitted_feature_id = feature.id;
    }
    await supabase
      .from('ideation_conversations')
      .update(updateData)
      .eq('id', conversation_id);

    return jsonResponse({
      data: {
        feature,
        dedup_check: dedupResult,
        speckit_spec: specMarkdown,
        speckit_research: researchMarkdown,
      },
    }, 201);
  } catch (error) {
    console.error('devpilot-submit-proposal error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
