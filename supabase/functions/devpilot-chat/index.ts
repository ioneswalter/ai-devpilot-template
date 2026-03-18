/**
 * DevPilot Chat Edge Function
 * POST: Send a message in an ideation conversation and receive AI response
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

const requestSchema = z.object({
  conversation_id: z.string().min(1, 'Conversation ID required'),
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
});

interface FeatureContext {
  feature_code: string;
  title: string;
  description: string;
  status: string;
  category: string | null;
  acceptance_criteria: string[] | null;
}

function buildSystemPrompt(features: FeatureContext[], isAdmin: boolean, existingSections: string[] = []): string {
  const featureList = features
    .map((f) => {
      const desc = f.description ? ` | ${f.description.substring(0, 150)}` : '';
      const criteria = Array.isArray(f.acceptance_criteria)
        ? f.acceptance_criteria.slice(0, 5).join('; ')
        : 'none';
      return `- ${f.feature_code}: "${f.title}" [${f.status}] (${f.category ?? 'uncategorised'})${desc} — Criteria: ${criteria}`;
    })
    .join('\n');

  const roleDesc = isAdmin
    ? `You are DevPilot, an AI product development copilot for OwnYourGig platform admins.
You help admins explore feature ideas, assess their value, and produce structured proposals.`
    : `You are DevPilot, an AI assistant helping OwnYourGig members propose new features.
You help members describe problems they want solved and produce clear feature proposals.`;

  const proposalFormat = isAdmin
    ? `## Scope Management
When the user's idea spans multiple distinct capabilities, you MUST split it into separate, focused features:
- Each feature should be independently deliverable and testable
- Suggest a logical delivery order (P2 for MVP slice, P3/P4 for follow-ups)
- ALWAYS use an existing roadmap section from the list below. Only create a new section if the feature truly doesn't fit any existing one
- Explain the split briefly: "I've broken this into X features so each can be built and shipped independently"

When asked to generate a proposal, output a JSON block. If the idea should be split, output MULTIPLE proposals in an array:
\`\`\`json
{
  "type": "proposal",
  "proposals": [
    {
      "title": "Feature title (keep focused and specific)",
      "description": "What this feature does and why",
      "acceptance_criteria": ["Given..., When..., Then..."],
      "priority": "P1|P2|P3|P4",
      "category": "toolkit|business_module|null",
      "spec_section": "Must be one of the existing roadmap sections listed below",
      "problem_statement": "The problem being solved",
      "solution": "The proposed solution"
    }
  ]
}
\`\`\`
For a single well-scoped feature, the array will have one item. For broad ideas, split into 2-4 focused features.
A single feature should have no more than 5-7 acceptance criteria. If you need more, that's a sign it should be split.`
    : `## Scope Management
When the user's idea spans multiple distinct capabilities, you MUST split it into separate, focused features:
- Each feature should be independently deliverable and testable
- Explain the split briefly: "I've broken this into X features so each can be built and shipped independently"

When asked to generate a proposal, output a JSON block. If the idea should be split, output MULTIPLE proposals in an array:
\`\`\`json
{
  "type": "proposal",
  "proposals": [
    {
      "title": "Feature title (keep focused and specific)",
      "description": "What this feature does and why",
      "acceptance_criteria": ["Clear criteria for what success looks like"]
    }
  ]
}
\`\`\`
For a single well-scoped feature, the array will have one item. For broad ideas, split into 2-4 focused features.
A single feature should have no more than 5-7 acceptance criteria. If you need more, that's a sign it should be split.`;

  return `${roleDesc}

## Your Behaviour
1. Ask clarifying questions about the problem, business value, target users, and expected outcomes.
   **CRITICAL: Before asking ANY question, check the existing roadmap below.** If an existing feature already answers the question (e.g. pricing model, user roles, integrations), reference that feature's details instead of asking. For example:
   - DON'T ask "How should pricing work?" if an existing feature already defines a pricing model — instead say "Currently FR-054 offers courses with per-course pricing for non-members and included access for members. Would an LMS follow the same model?"
   - DON'T ask "Should members get discounts?" if membership benefits are already defined — reference what exists and ask if it should change.
   - DO ask about genuinely new aspects that no existing feature covers.
   When you do ask questions, make them specific and grounded in what already exists on the roadmap.
2. Proactively TRIAGE the idea against the existing product roadmap. Compare what the user describes against ALL features below.
3. When you detect overlap, respond with one of these actions:
   - **Feature already released**: Explain what it does and how to use it. Recommend NOT creating a new proposal.
   - **Proposal already exists** (proposed/approved/in_development): Show the existing proposal and suggest enhancing it.
   - **Similar proposals from others**: Recommend converging rather than duplicating.
   - **Truly new idea**: Confirm novelty and continue refining.
4. When flagging overlaps, include a JSON metadata block:
\`\`\`json
{
  "type": "dedup_warning",
  "matches": [
    {
      "feature_code": "FR-XXX",
      "title": "Feature title",
      "similarity": "high|medium",
      "status": "released|proposed|approved|in_development",
      "description_excerpt": "Brief description",
      "recommendation": "use_existing|enhance_existing|converge"
    }
  ]
}
\`\`\`
5. Keep responses concise and conversational. Use markdown for formatting.
6. Only generate a proposal when the user explicitly asks for one.

${proposalFormat}

## Existing Roadmap Sections (ALWAYS use one of these)
${existingSections.length > 0 ? existingSections.map(s => `- ${s}`).join('\n') : '- No sections yet'}

## Existing Product Roadmap (${features.length} features)
${featureList}

IMPORTANT: Always wrap metadata JSON blocks in triple backticks with the json language tag. Only include ONE metadata block per response (either dedup_warning OR proposal, not both).`;
}

function parseMetadata(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    if (parsed.type === 'dedup_warning') {
      return parsed;
    }
    if (parsed.type === 'proposal') {
      // Normalize: support both old single "proposal" and new "proposals" array format
      if (parsed.proposals && Array.isArray(parsed.proposals)) {
        return parsed;
      }
      if (parsed.proposal) {
        return { type: 'proposal', proposals: [parsed.proposal] };
      }
      return parsed;
    }
  } catch {
    // Not valid JSON metadata — that's fine
  }
  return null;
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
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
    }
    const { conversation_id, message } = validation.data;

    // Verify conversation access
    const { data: conv, error: convErr } = await supabase
      .from('ideation_conversations')
      .select('id, status, created_by')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) return errorResponse('NOT_FOUND', 'Conversation not found', 404);
    if (conv.created_by !== user.id && !isAdmin) {
      return errorResponse('FORBIDDEN', 'You do not have access to this conversation', 403);
    }
    if (conv.status !== 'draft') {
      return errorResponse('VALIDATION_ERROR', 'Conversation is not in draft status', 400);
    }

    // Save user message
    const { data: userMsg, error: userMsgErr } = await supabase
      .from('conversation_messages')
      .insert({ conversation_id, role: 'user', content: message })
      .select('id, role, content, metadata, created_at')
      .single();

    if (userMsgErr) {
      console.error('Save user message error:', userMsgErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to save message', 500);
    }

    // Fetch product features for context
    const { data: features } = await supabase
      .from('product_features')
      .select('feature_code, title, description, status, category, acceptance_criteria, spec_section')
      .order('feature_code');

    // Extract distinct roadmap sections from existing features
    const existingSections = [...new Set(
      (features ?? [])
        .map((f: { spec_section?: string | null }) => f.spec_section)
        .filter((s): s is string => !!s)
    )].sort();

    // Fetch conversation history
    const { data: history } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    // Build messages for Claude (truncate long conversations to fit context window)
    const systemPrompt = buildSystemPrompt((features ?? []) as FeatureContext[], isAdmin, existingSections);
    const allMessages = (history ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let messages = allMessages;
    if (allMessages.length > 50) {
      const first = allMessages.slice(0, 2);
      const recent = allMessages.slice(-20);
      const summaryNote = {
        role: 'assistant' as const,
        content: `[Note: ${allMessages.length - 22} earlier messages were omitted to stay within context limits. The conversation started with the messages above and continued with the messages below.]`,
      };
      messages = [...first, summaryNote, ...recent];
    }

    // Check API key
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return errorResponse('AI_ERROR', 'AI service not configured', 500);
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let aiContent: string;
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      });
      clearTimeout(timeoutId);

      const textBlock = response.content.find((b) => b.type === 'text');
      aiContent = textBlock && textBlock.type === 'text' ? textBlock.text : 'I was unable to generate a response.';
    } catch (aiError) {
      clearTimeout(timeoutId);
      console.error('Claude API error:', aiError);
      return errorResponse('AI_ERROR', 'Failed to generate AI response', 500);
    }

    // Parse metadata from AI response
    const metadata = parseMetadata(aiContent);

    // Save assistant message
    const { data: assistantMsg, error: assistantMsgErr } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id,
        role: 'assistant',
        content: aiContent,
        metadata: metadata ?? null,
      })
      .select('id, role, content, metadata, created_at')
      .single();

    if (assistantMsgErr) {
      console.error('Save assistant message error:', assistantMsgErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to save AI response', 500);
    }

    // Update conversation timestamp + auto-title
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Auto-generate title from first user message
    const { count: msgCount } = await supabase
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation_id)
      .eq('role', 'user');

    if (msgCount === 1) {
      updates.title = message.substring(0, 200);
    }

    await supabase
      .from('ideation_conversations')
      .update(updates)
      .eq('id', conversation_id);

    return jsonResponse({
      data: {
        user_message: userMsg,
        assistant_message: assistantMsg,
      },
    });
  } catch (error) {
    console.error('devpilot-chat error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
