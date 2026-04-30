/**
 * DevPilot Submit Proposal Edge Function
 * POST: Submit a finalized proposal, creating a new product feature
 *
 * FR-090 Feature Ideation Chat
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import { performDedupCheck } from '../_shared/dedup-check.ts';
import { enrichMatchWithVersionInfo } from '../_shared/dedup-enrichment.ts';
import { extractFrCodes } from '../_shared/fr-code-extractor.ts';
import { getInFlightVersion } from '../_shared/version-utils.ts';
import { generateSpecMarkdown, extractResearchNotes } from '../_shared/speckit-generator.ts';
import type { SpecKitProposal } from '../_shared/speckit-generator.ts';
import { buildTestCases, attachPrototype } from './proposal-helpers.ts';

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
    journeys: z.array(journeySchema).optional(),
    test_cases: z
      .array(
        z.object({
          title: z.string().min(1),
          type: z.enum(['api', 'e2e']),
          scenario: z.string().min(1),
        })
      )
      .optional(),
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
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.substring(7));
    if (authErr || !user) return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Validate request
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
    if (conv.status === 'cancelled') {
      return errorResponse('VALIDATION_ERROR', 'Conversation has been cancelled', 400);
    }

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
      .select('id, feature_code, title, description, status');

    const featuresList = (allFeatures ?? []) as Array<{
      id: string;
      feature_code: string;
      title: string;
      description: string;
      status: string;
    }>;

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    const dedupResult = await performDedupCheck(proposal, featuresList, anthropicApiKey);

    // FR-149 v1.1 patch / FR-025: deterministic FR-code pre-pass. Any feature
    // explicitly referenced by code (e.g. "FR-130 v2.0" in the title) MUST be
    // surfaced as a high-similarity match regardless of what the AI returned.
    // Closes the FR-130 → FR-158 incident on 2026-04-27.
    const explicitCodes = extractFrCodes(proposal.title, proposal.description);
    if (explicitCodes.length > 0) {
      const featureByCode = new Map(featuresList.map((f) => [f.feature_code, f]));
      const aiMatchByCode = new Map(dedupResult.matches.map((m) => [m.feature_code, m]));
      for (const code of explicitCodes) {
        const feature = featureByCode.get(code);
        if (!feature) continue;
        const aiMatch = aiMatchByCode.get(code);
        if (aiMatch) {
          aiMatch.similarity = 'high';
          continue;
        }
        dedupResult.matches.push({
          feature_code: feature.feature_code,
          title: feature.title,
          similarity: 'high',
          status: feature.status,
          description_excerpt: feature.description.substring(0, 150),
          recommendation: 'enhance_existing',
        });
      }
      if (dedupResult.matches.length > 0) dedupResult.passed = false;
    }

    // FR-149 v1.1 / J9: enrich matches with authoritative DB status + in-flight version info.
    // Replaces AI-claimed status (which has been observed to hallucinate) so the client
    // can render correct badges and offer "Add to in-flight v1.N" instead of a doomed bump.
    if (dedupResult.matches.length > 0) {
      const dbFeatureMap = new Map(
        featuresList.map((f) => [f.feature_code, { status: f.status, id: f.id }])
      );
      const inFlightEntries = await Promise.all(
        dedupResult.matches.map(async (m) => {
          const db = dbFeatureMap.get(m.feature_code);
          if (!db) return null;
          const inFlight = await getInFlightVersion(supabase, db.id);
          return inFlight
            ? ([m.feature_code, { version_label: inFlight.version_label }] as const)
            : null;
        })
      );
      const inFlightMap = new Map(
        inFlightEntries.filter((e): e is readonly [string, { version_label: string }] => e !== null)
      );
      dedupResult.matches = dedupResult.matches.map(
        (m) =>
          enrichMatchWithVersionInfo(
            m as unknown as { feature_code: string; status: string },
            dbFeatureMap,
            inFlightMap
          ) as typeof m
      );
    }

    // Generate SpecKit artifacts
    const specMarkdown = generateSpecMarkdown(proposal as SpecKitProposal, featureCode);

    const { data: convMessages } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(50);

    const researchMarkdown = extractResearchNotes(
      (convMessages ?? []) as Array<{ role: string; content: string }>,
      proposal.title
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

    // Store SpecKit artifacts
    const now = new Date().toISOString();
    const { error: artifactErr } = await supabase.from('feature_spec_artifacts').insert([
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
    ]);
    if (artifactErr) console.error('Failed to save SpecKit artifacts:', artifactErr);

    // Generate and insert test cases
    const testCases = buildTestCases(proposal, featureCode, feature.id);
    if (testCases.length > 0) {
      const { error: tcErr } = await supabase.from('test_cases').insert(testCases);
      if (tcErr) console.error('Failed to create test cases:', tcErr);
    }

    // Update conversation
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (!conv.submitted_feature_id) {
      updateData.status = 'submitted';
      updateData.submitted_feature_id = feature.id;
    }
    await supabase.from('ideation_conversations').update(updateData).eq('id', conversation_id);

    // FR-140: Attach prototype
    const prototypeAttachment = await attachPrototype(supabase, conversation_id, feature.id);

    // FR-141: Link any curated UAT scenarios on this conversation to the new feature.
    // Drafts are intentionally NOT linked — only curated scenarios travel downstream.
    const { count: scenarioCount, error: scenarioLinkErr } = await supabase
      .from('uat_scenarios')
      .update({ feature_id: feature.id, updated_at: new Date().toISOString() }, { count: 'exact' })
      .eq('conversation_id', conversation_id)
      .is('feature_id', null)
      .eq('review_status', 'curated')
      .select('id', { count: 'exact', head: true });
    if (scenarioLinkErr) {
      console.error('FR-141 link curated scenarios failed:', scenarioLinkErr);
    }

    return jsonResponse(
      {
        data: {
          feature,
          dedup_check: dedupResult,
          speckit_spec: specMarkdown,
          speckit_research: researchMarkdown,
          prototype_attachment: prototypeAttachment,
          scenario_count: scenarioCount ?? 0,
        },
      },
      201
    );
  } catch (error) {
    console.error('devpilot-submit-proposal error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
