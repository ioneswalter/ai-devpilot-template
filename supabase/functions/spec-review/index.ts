/**
 * Spec Review API Edge Function (FR-091)
 * Routes requests to handlers based on HTTP method and query params
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleStartReview } from './start-review.ts'
import { handleApproveReview } from './approve-review.ts'
import { handleUpdateReview } from './update-review.ts'
import { handleSendBack } from './send-back.ts'
import {
  startReviewSchema,
  updateReviewSchema,
  approveSchema,
  sendBackSchema,
} from './schemas.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const url = new URL(req.url)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization header', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired token', 401)
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('user_id, email')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!adminUser) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403)
    }

    const method = req.method
    const action = url.searchParams.get('action')
    const featureId = url.searchParams.get('feature_id')

    if (method === 'GET') {
      if (!featureId) {
        return errorResponse('BAD_REQUEST', 'feature_id query param required', 400)
      }

      const includeHistory = url.searchParams.get('include_history') === 'true'

      const { data: review, error: reviewErr } = await supabase
        .from('spec_reviews')
        .select('*')
        .eq('feature_id', featureId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (reviewErr) {
        console.error('Failed to fetch review:', reviewErr)
        return errorResponse('DATABASE_ERROR', 'Failed to fetch review', 500)
      }

      if (!review) {
        return errorResponse('NOT_FOUND', 'No review exists for this feature', 404)
      }

      const { data: items } = await supabase
        .from('review_items')
        .select('*')
        .eq('review_id', review.id)
        .order('sort_order', { ascending: true })

      let history: unknown[] = []
      if (includeHistory) {
        const { data: historyData } = await supabase
          .from('spec_reviews')
          .select('id, status, reviewer_name, created_at')
          .eq('feature_id', featureId)
          .order('created_at', { ascending: false })

        history = historyData ?? []
      }

      return jsonResponse({
        data: {
          review,
          items: items ?? [],
          ...(includeHistory ? { history } : {}),
        },
      })
    }

    if (method === 'POST') {
      const body = await req.json()

      if (action === 'approve') {
        const parsed = approveSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse('VALIDATION_ERROR', parsed.error.issues[0].message, 400)
        }
        const result = await handleApproveReview({
          reviewId: parsed.data.review_id,
          version: parsed.data.version,
          userId: user.id,
          supabase,
        })
        if (result.error) {
          return errorResponse(result.error.code, result.error.message, result.status)
        }
        return jsonResponse({ data: result.data }, result.status)
      }

      if (action === 'send-back') {
        const parsed = sendBackSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse('VALIDATION_ERROR', parsed.error.issues[0].message, 400)
        }
        const result = await handleSendBack({
          reviewId: parsed.data.review_id,
          version: parsed.data.version,
          feedback: parsed.data.feedback,
          supabase,
        })
        if (result.error) {
          return errorResponse(result.error.code, result.error.message, result.status)
        }
        return jsonResponse({ data: result.data }, result.status)
      }

      const parsed = startReviewSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse('VALIDATION_ERROR', parsed.error.issues[0].message, 400)
      }
      const result = await handleStartReview({
        featureId: parsed.data.feature_id,
        userId: user.id,
        supabase,
      })
      if (result.error) {
        return errorResponse(result.error.code, result.error.message, result.status)
      }
      return jsonResponse({ data: result.data }, result.status)
    }

    if (method === 'PATCH') {
      const body = await req.json()
      const parsed = updateReviewSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse('VALIDATION_ERROR', parsed.error.issues[0].message, 400)
      }
      const result = await handleUpdateReview({
        input: parsed.data,
        userId: user.id,
        userName: adminUser.email,
        supabase,
      })
      if (result.error) {
        return errorResponse(result.error.code, result.error.message, result.status)
      }
      return jsonResponse({ data: result.data }, result.status)
    }

    return errorResponse('METHOD_NOT_ALLOWED', `Method ${method} not supported`, 405)

  } catch (error) {
    console.error('Spec review API error:', error)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
  }
})
