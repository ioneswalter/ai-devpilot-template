/**
 * Spec Review API (FR-091)
 *
 * POST /spec-review — Start a new review (AI enrichment)
 * GET  /spec-review?feature_id=... — Get current review + items
 * PATCH /spec-review — Update review items (decisions, comments)
 * POST /spec-review?action=approve — Approve feature
 * POST /spec-review?action=send-back — Send back to ideation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { startReviewSchema, updateReviewSchema, approveSchema, sendBackSchema } from './schemas.ts';
import { handleStartReview } from './start-review.ts';
import { handleUpdateReview } from './update-review.ts';
import { handleApproveReview } from './approve-review.ts';
import { handleSendBack } from './send-back.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: require valid token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);
    }

    // Admin check
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // ── GET: Fetch review ────────────────────────────────────────────
    if (req.method === 'GET') {
      const featureId = url.searchParams.get('feature_id');
      if (!featureId) {
        return errorResponse('INVALID_INPUT', 'feature_id query parameter is required', 400);
      }

      const includeHistory = url.searchParams.get('include_history') === 'true';

      // Get latest review for this feature
      const { data: review, error: reviewErr } = await supabase
        .from('spec_reviews')
        .select('*')
        .eq('feature_id', featureId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reviewErr || !review) {
        return errorResponse('NO_REVIEW_FOUND', 'No review exists for this feature', 404);
      }

      // Get items for this review
      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', review.id)
        .order('sort_order', { ascending: true });

      const response: Record<string, unknown> = { review, items: items || [] };

      // Optionally include review history
      if (includeHistory) {
        const { data: history } = await supabase
          .from('spec_reviews')
          .select('id, status, reviewer_name, created_at')
          .eq('feature_id', featureId)
          .order('created_at', { ascending: false });

        response.history = history || [];
      }

      return jsonResponse({ data: response });
    }

    // ── POST: Start review, approve, or send back ────────────────────
    if (req.method === 'POST') {
      const body = await req.json();

      if (action === 'approve') {
        const validation = approveSchema.safeParse(body);
        if (!validation.success) {
          return errorResponse('INVALID_INPUT', validation.error.errors[0].message, 400);
        }
        const result = await handleApproveReview({
          reviewId: validation.data.review_id,
          version: validation.data.version,
          userId: user.id,
          supabase,
        });
        if (result.error) return errorResponse(result.error.code, result.error.message, result.status);
        return jsonResponse({ data: result.data }, result.status);
      }

      if (action === 'send-back') {
        const validation = sendBackSchema.safeParse(body);
        if (!validation.success) {
          return errorResponse('INVALID_INPUT', validation.error.errors[0].message, 400);
        }
        const result = await handleSendBack({
          reviewId: validation.data.review_id,
          version: validation.data.version,
          feedback: validation.data.feedback,
          supabase,
        });
        if (result.error) return errorResponse(result.error.code, result.error.message, result.status);
        return jsonResponse({ data: result.data }, result.status);
      }

      // Default POST: start review
      const validation = startReviewSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse('INVALID_INPUT', validation.error.errors[0].message, 400);
      }
      const result = await handleStartReview({
        featureId: validation.data.feature_id,
        userId: user.id,
        supabase,
      });
      if (result.error) return errorResponse(result.error.code, result.error.message, result.status);
      return jsonResponse({ data: result.data }, result.status);
    }

    // ── PATCH: Update review items ───────────────────────────────────
    if (req.method === 'PATCH') {
      const body = await req.json();
      const validation = updateReviewSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse('INVALID_INPUT', validation.error.errors[0].message, 400);
      }
      const result = await handleUpdateReview({
        input: validation.data,
        userId: user.id,
        userName: adminRow.email ?? null,
        supabase,
      });
      if (result.error) return errorResponse(result.error.code, result.error.message, result.status);
      return jsonResponse({ data: result.data }, result.status);
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);

  } catch (error) {
    console.error('spec-review error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
