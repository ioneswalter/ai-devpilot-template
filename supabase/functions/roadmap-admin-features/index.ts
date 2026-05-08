/**
 * Roadmap Admin Features API (FR-029)
 *
 * Admin-only endpoints for managing features and journeys
 *
 * POST /roadmap-admin-features - Create a new feature or journey
 * PATCH /roadmap-admin-features - Update a feature or journey
 * DELETE /roadmap-admin-features?feature_id=xxx - Delete a feature (only proposed/roadmap status)
 * POST /roadmap-admin-features/request-implementation - Request AI implementation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, isAdmin, errorResponse } from './shared.ts';
import { handleCreateFeature } from './create-handler.ts';
import { handleUpdateFeature } from './update-handler.ts';
import {
  handleRequestImplementation,
  handleDeleteFeature,
  handleGetAdmin,
} from './other-handlers.ts';
import {
  handleApiKeyIssue,
  handleApiKeyRotate,
  handleApiKeyRevoke,
  handleApiKeyList,
} from './api-key-handlers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require authentication for all operations
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
    }

    // Verify user is admin (check by user_id and email)
    const adminCheck = await isAdmin(supabase, user.id, user.email);
    if (!adminCheck) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // FR-163 J2 — API key lifecycle endpoints
    if (req.method === 'POST' && action === 'api-key-issue') {
      return await handleApiKeyIssue(req, supabase, user.id);
    }
    if (req.method === 'POST' && action === 'api-key-rotate') {
      return await handleApiKeyRotate(req, supabase, user.id);
    }
    if (req.method === 'POST' && action === 'api-key-revoke') {
      return await handleApiKeyRevoke(req, supabase);
    }
    if (req.method === 'GET' && action === 'api-keys') {
      return await handleApiKeyList(req, supabase);
    }

    // POST - Create a new feature or journey
    if (req.method === 'POST' && action !== 'request-implementation') {
      return await handleCreateFeature(req, supabase, user.id, user.email);
    }

    // POST /request-implementation - Request AI implementation
    if (req.method === 'POST' && action === 'request-implementation') {
      return await handleRequestImplementation(req, supabase, user.id, user.email);
    }

    // PATCH - Update a feature
    if (req.method === 'PATCH') {
      return await handleUpdateFeature(req, supabase, user.id, user.email);
    }

    // DELETE - Delete a feature
    if (req.method === 'DELETE') {
      return await handleDeleteFeature(req, supabase, user.email);
    }

    // GET - Check if current user is admin
    if (req.method === 'GET') {
      return handleGetAdmin(user.email);
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } catch (error) {
    console.error('roadmap-admin-features error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
