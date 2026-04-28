/**
 * POST handler — Create a new feature or journey
 */

import type { SupabaseClient } from './shared.ts';
import {
  CreateFeatureSchema,
  corsHeaders,
  generateFeatureCode,
  parseAcceptanceCriteria,
  errorResponse,
  jsonResponse,
} from './shared.ts';
import {
  parseTestCasesText,
  generateTestCaseCode,
  filterDuplicateTestCases,
} from './test-case-helpers.ts';

export async function handleCreateFeature(
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined
): Promise<Response> {
  const rawBody = await req.json();
  const validation = CreateFeatureSchema.safeParse(rawBody);

  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
  }

  const {
    title,
    description,
    feature_type,
    priority,
    acceptance_criteria_text,
    acceptance_criteria,
    category,
    spec_section,
    related_user_stories,
    test_cases_text,
  } = validation.data;

  // Parse acceptance criteria from text, or use provided array
  let parsedCriteria: string[] = acceptance_criteria;
  if (acceptance_criteria_text.trim()) {
    console.log('Parsing acceptance criteria from text...');
    parsedCriteria = parseAcceptanceCriteria(acceptance_criteria_text);
    console.log('Parsed', parsedCriteria.length, 'criteria from text');
  }

  // Get existing feature codes to generate next one
  const { data: existingFeatures } = await supabase.from('product_features').select('feature_code');

  const existingCodes = (existingFeatures || []).map(
    (f: { feature_code: string }) => f.feature_code
  );
  const featureCode = generateFeatureCode(
    existingCodes,
    feature_type === 'journey' ? 'journey' : 'feature'
  );

  const now = new Date().toISOString();
  const { data: feature, error: insertError } = await supabase
    .from('product_features')
    .insert({
      id: crypto.randomUUID(),
      feature_code: featureCode,
      title,
      description,
      feature_type,
      priority,
      status: 'proposed',
      acceptance_criteria: parsedCriteria,
      category,
      spec_section,
      related_user_stories,
      spec_branch: '001-coop-marketplace-platform',
      created_by: userId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating feature:', insertError);
    return errorResponse('DATABASE_ERROR', 'Failed to create feature', 500);
  }

  // Create test cases if provided
  if (test_cases_text.trim()) {
    await createTestCasesForFeature(supabase, feature, featureCode, test_cases_text, userId, now);
  }

  console.log('Admin created feature:', featureCode, 'by', userEmail);

  return jsonResponse(feature, 201);
}

/** Insert parsed test cases for a newly created feature */
async function createTestCasesForFeature(
  supabase: SupabaseClient,
  feature: { id: string },
  featureCode: string,
  testCasesText: string,
  userId: string,
  now: string
): Promise<void> {
  const parsedTestCases = parseTestCasesText(testCasesText);
  if (parsedTestCases.length === 0) return;

  console.log('Creating', parsedTestCases.length, 'test cases for', featureCode);

  const { data: existingTestCases } = await supabase
    .from('test_cases')
    .select('test_code, title')
    .eq('feature_id', feature.id);

  const existingTCCodes = (existingTestCases || []).map(
    (tc: { test_code: string }) => tc.test_code
  );
  const existingTitles = (existingTestCases || []).map((tc: { title: string }) => ({
    title: tc.title,
  }));

  const { unique: uniqueTestCases, duplicates } = filterDuplicateTestCases(
    parsedTestCases,
    existingTitles
  );

  if (duplicates.length > 0) {
    console.log('Skipping', duplicates.length, 'duplicate test cases:', duplicates);
  }

  for (const tc of uniqueTestCases) {
    const testCode = generateTestCaseCode(existingTCCodes, featureCode);
    existingTCCodes.push(testCode);

    await supabase.from('test_cases').insert({
      id: crypto.randomUUID(),
      test_code: testCode,
      feature_id: feature.id,
      title: tc.title,
      test_type: tc.test_type,
      priority: tc.priority,
      status: 'draft',
      automated: false,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
  }
  console.log('Created', uniqueTestCases.length, 'test cases for', featureCode);
}
