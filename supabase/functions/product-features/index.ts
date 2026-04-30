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
      .from('product_features')
      .select(
        `
        *,
        test_cases:test_cases(*)
      `
      )
      .order('feature_code', { ascending: true })
      .order('test_code', { ascending: true, referencedTable: 'test_cases' });

    if (featuresError) {
      console.error('Get features error:', featuresError);
      return new Response(
        JSON.stringify({
          error: { code: 'QUERY_ERROR', message: 'Failed to fetch features' },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // FR-141: per-feature curated UAT scenario count for the Roadmap badge.
    const { data: scenarioRows } = await supabase
      .from('uat_scenarios')
      .select('feature_id')
      .eq('review_status', 'curated')
      .not('feature_id', 'is', null);
    const scenarioCounts = new Map<string, number>();
    for (const row of scenarioRows ?? []) {
      const fid = row.feature_id as string | null;
      if (!fid) continue;
      scenarioCounts.set(fid, (scenarioCounts.get(fid) ?? 0) + 1);
    }

    // Format response - map database fields to API response format
    const formattedFeatures = (features || []).map((feature) => ({
      id: feature.id,
      feature_code: feature.feature_code,
      title: feature.title,
      description: feature.description,
      acceptance_criteria: feature.acceptance_criteria,
      feature_type: feature.feature_type,
      priority: feature.priority,
      status: feature.status,
      category: feature.category || null,
      spec_section: feature.spec_section,
      related_user_stories: feature.related_user_stories || [],
      implementing_features: feature.implementing_features || null,
      created_at: feature.created_at,
      updated_at: feature.updated_at,
      scenario_count: scenarioCounts.get(feature.id) ?? 0,
      test_cases: (feature.test_cases || []).map((tc: Record<string, unknown>) => ({
        id: tc.id,
        test_code: tc.test_code,
        title: tc.title,
        description: tc.description,
        test_type: tc.test_type,
        priority: tc.priority,
        status: tc.status,
        automated: tc.automated,
        passed: tc.passed,
      })),
    }));

    return new Response(JSON.stringify({ data: formattedFeatures }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
