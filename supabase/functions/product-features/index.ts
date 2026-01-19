/**
 * GET /product-features
 * Get all product features with test cases (for product copilot)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create Supabase client with service role for database access
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all product features with test cases
    const { data: features, error: featuresError } = await supabase
      .from('ProductFeature')
      .select(`
        *,
        test_cases:TestCase(*)
      `)
      .order('feature_id', { ascending: true });

    if (featuresError) {
      console.error('Get features error:', featuresError);
      return new Response(
        JSON.stringify({
          error: { code: 'QUERY_ERROR', message: 'Failed to fetch features' },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format response
    const formattedFeatures = (features || []).map((feature) => ({
      id: feature.id,
      feature_id: feature.feature_id,
      name: feature.name,
      description: feature.description,
      status: feature.status,
      priority: feature.priority,
      category: feature.category,
      user_story: feature.user_story,
      acceptance_criteria: feature.acceptance_criteria,
      created_at: feature.created_at,
      updated_at: feature.updated_at,
      test_cases: (feature.test_cases || []).map((tc: Record<string, unknown>) => ({
        id: tc.id,
        test_case_id: tc.test_case_id,
        name: tc.name,
        description: tc.description,
        status: tc.status,
        steps: tc.steps,
        expected_result: tc.expected_result,
        actual_result: tc.actual_result,
        notes: tc.notes,
        created_at: tc.created_at,
        updated_at: tc.updated_at,
      })),
    }));

    return new Response(
      JSON.stringify({ data: formattedFeatures }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('product-features error:', error);
    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
