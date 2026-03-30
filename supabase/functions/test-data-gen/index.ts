/**
 * Test Data Generation Edge Function (FR-111)
 * Generates realistic test data for features using AI, with cleanup support.
 *
 * POST ?action=generate  — Generate test data for a feature
 * POST ?action=cleanup   — Clean up generated test data for a feature
 * GET  ?action=list       — List generated datasets for a feature
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

    // Lazy imports to keep cold start fast
    if (action === 'generate' && req.method === 'POST') {
      const { handleGenerate } = await import('./generate.ts');
      return handleGenerate(req);
    }
    if (action === 'cleanup' && req.method === 'POST') {
      const { handleCleanup } = await import('./cleanup.ts');
      return handleCleanup(req);
    }
    if (action === 'list' && req.method === 'GET') {
      const { handleList } = await import('./generate.ts');
      return handleList(req);
    }

    return error('INVALID_ACTION', `Unknown action: ${action}`, 400);
  } catch (err) {
    console.error('test-data-gen error:', err);
    return error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
