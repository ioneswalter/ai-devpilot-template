/**
 * Guided Testing Edge Function (FR-108)
 * AI-powered testing co-pilot with step guidance, validation, and suggestions.
 *
 * POST ?action=generate-guidance  — Generate AI test steps from criteria + page state
 * POST ?action=validate-state     — Compare actual vs expected page state
 * POST ?action=suggest-exploratory — Suggest exploratory tests from failures
 * POST ?action=create-session     — Create a new guided test session
 * POST ?action=complete-session   — Mark session completed/abandoned
 */

import { corsHeaders } from '../_shared/cors.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method !== 'POST') {
      return error('METHOD_NOT_ALLOWED', 'Only POST is supported', 405);
    }

    // Lazy imports to keep cold start fast
    if (action === 'generate-guidance') {
      const { handleGenerateGuidance } = await import('./generate-guidance.ts');
      return handleGenerateGuidance(req);
    }
    if (action === 'validate-state') {
      const { handleValidateState } = await import('./validate-state.ts');
      return handleValidateState(req);
    }
    if (action === 'suggest-exploratory') {
      const { handleSuggestExploratory } = await import('./suggest-exploratory.ts');
      return handleSuggestExploratory(req);
    }
    if (action === 'create-session' || action === 'complete-session') {
      const { handleSession } = await import('./session-handlers.ts');
      return handleSession(req, action);
    }

    return error('INVALID_ACTION', `Unknown action: ${action}`, 400);
  } catch (err) {
    console.error('guided-testing error:', err);
    return error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
