/**
 * DevPilot Submit Proposal Edge Function
 * POST: Submit a finalized proposal, creating a new product feature
 *
 * FR-090 Feature Ideation Chat
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

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

const proposalSchema = z.object({
  conversation_id: z.string().min(1),
  proposal: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().min(1, 'Description is required'),
    acceptance_criteria: z.array(z.string()).min(1, 'At least one criterion required'),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    category: z.enum(['toolkit', 'business_module']).nullable().optional(),
    spec_section: z.string().optional(),
  }),
});

interface DedupMatch {
  feature_code: string;
  title: string;
  similarity: 'high' | 'medium';
  status: string;
  description_excerpt: string;
  recommendation: 'use_existing' | 'enhance_existing' | 'converge';
}

async function performDedupCheck(
  proposal: { title: string; description: string; acceptance_criteria: string[] },
  features: Array<{ feature_code: string; title: string; description: string; status: string }>,
  anthropicApiKey: string
): Promise<{ passed: boolean; matches: DedupMatch[] }> {
  if (!anthropicApiKey || features.length === 0) {
    return { passed: true, matches: [] };
  }

  const featureList = features
    .map((f) => `- ${f.feature_code}: "${f.title}" [${f.status}] — ${f.description.substring(0, 150)}`)
    .join('\n');

  const prompt = `Compare this proposal against the existing features and identify semantic overlaps.

PROPOSAL:
Title: ${proposal.title}
Description: ${proposal.description}
Criteria: ${proposal.acceptance_criteria.join('; ')}

EXISTING FEATURES:
${featureList}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "matches": [
    {
      "feature_code": "FR-XXX",
      "title": "Feature title",
      "similarity": "high|medium",
      "status": "released|proposed|approved|in_development",
      "description_excerpt": "Brief excerpt",
      "recommendation": "use_existing|enhance_existing|converge"
    }
  ]
}

Rules:
- Only include features with MEANINGFUL semantic overlap (not superficial keyword matches)
- "high" = covers 70%+ of the proposal scope
- "medium" = covers 30-70% of the proposal scope
- Ignore features with < 30% overlap
- If no meaningful overlap, return {"matches": []}`;

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return { passed: true, matches: [] };

    let text = textBlock.text.trim();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1].trim();

    const result = JSON.parse(text);
    const matches: DedupMatch[] = Array.isArray(result.matches) ? result.matches : [];
    return { passed: matches.length === 0, matches };
  } catch (err) {
    console.error('Dedup check error:', err);
    return { passed: true, matches: [] };
  }
}

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

    // Validate request
    const body = await req.json();
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
      },
    }, 201);
  } catch (error) {
    console.error('devpilot-submit-proposal error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
