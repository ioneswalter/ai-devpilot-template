/**
 * PATCH handler — Update an existing feature
 */

import type { SupabaseClient } from './shared.ts';
import {
  UpdateFeatureSchema,
  errorResponse,
  jsonResponse,
} from './shared.ts';
import {
  parseTestCasesText,
  generateTestCaseCode,
  filterDuplicateTestCases,
} from './test-case-helpers.ts';
import { checkUatReleaseGate } from './uat-release-gate.ts';

export async function handleUpdateFeature(
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
): Promise<Response> {
  const rawBody = await req.json();
  const validation = UpdateFeatureSchema.safeParse(rawBody);

  if (!validation.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      validation.error.errors[0].message,
      400,
    );
  }

  const { feature_id, test_cases_text, ...updates } = validation.data;

  // Only allow updating certain fields
  const allowedFields = [
    'title', 'description', 'feature_type', 'priority', 'status',
    'acceptance_criteria', 'category', 'spec_section',
    'related_user_stories', 'implementing_features',
  ];

  const filteredUpdates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in updates) {
      filteredUpdates[field] = updates[field as keyof typeof updates];
    }
  }

  // Validate status transitions if status is changing
  if ('status' in filteredUpdates) {
    const statusError = await validateStatusTransition(
      supabase,
      feature_id,
      filteredUpdates.status as string,
    );
    if (statusError) return statusError;
  }

  // FR-149: Block editing acceptance_criteria or description on released features
  if (!('status' in filteredUpdates)) {
    const editBlockedFields = ['acceptance_criteria', 'description'];
    const hasBlockedEdits = editBlockedFields.some(f => f in filteredUpdates);
    if (hasBlockedEdits) {
      const { data: current } = await supabase
        .from('product_features').select('status').eq('id', feature_id).single();
      if (current?.status === 'released') {
        return errorResponse(
          'VERSION_BUMP_REQUIRED',
          'Released features cannot be edited directly. Create a new version first.',
          409,
        );
      }
    }
  }

  // Allow update even if only test_cases_text is provided
  const hasTestCases = test_cases_text && test_cases_text.trim();
  if (Object.keys(filteredUpdates).length === 0 && !hasTestCases) {
    return errorResponse(
      'VALIDATION_ERROR',
      'No valid fields to update',
      400,
    );
  }

  const now = new Date().toISOString();
  filteredUpdates.updated_at = now;

  // FR-149 v1.1 hardening: snapshotFeatureVersion (legacy v1.0 audit-trail) is
  // removed. It produced NULL-label rows that collided with structured versioning
  // (bumpFeatureVersion / getInFlightVersion). Audit history for versioned features
  // now lives entirely in the labelled feature_versions chain managed by the bump
  // and merge flows.

  const { data: feature, error: updateError } = await supabase
    .from('product_features')
    .update(filteredUpdates)
    .eq('id', feature_id)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating feature:', updateError);
    return errorResponse('DATABASE_ERROR', 'Failed to update feature', 500);
  }

  // Handle test cases if provided
  if (hasTestCases) {
    await appendTestCases(supabase, feature, test_cases_text!, userId, now);
  }

  console.log('Admin updated feature:', feature.feature_code, 'by', userEmail);

  return jsonResponse(feature, 200);
}

/** Validate status transition rules, return error Response or null */
async function validateStatusTransition(
  supabase: SupabaseClient,
  featureId: string,
  newStatus: string,
): Promise<Response | null> {
  const statusOrder = [
    'proposed', 'specified', 'in_development', 'in_testing', 'released',
  ];

  const { data: currentFeature, error: fetchError } = await supabase
    .from('product_features')
    .select('status, acceptance_criteria, id')
    .eq('id', featureId)
    .single();

  if (fetchError || !currentFeature) {
    return errorResponse('NOT_FOUND', 'Feature not found', 404);
  }

  const fromIndex = statusOrder.indexOf(currentFeature.status);
  const toIndex = statusOrder.indexOf(newStatus);

  // Forward transitions — validate requirements for each stage traversed
  if (toIndex > fromIndex) {
    const targetStages = statusOrder.slice(fromIndex + 1, toIndex + 1);

    // Acceptance criteria required for approved, in_development, or released
    if (
      targetStages.some(
        s => s === 'specified' || s === 'in_development' || s === 'released',
      )
    ) {
      const criteria = currentFeature.acceptance_criteria as string[] | null;
      if (!criteria || criteria.length === 0) {
        return errorResponse(
          'MISSING_CRITERIA',
          `Cannot move to ${newStatus}: no acceptance criteria defined.`,
          400,
        );
      }
    }

    // Test cases required for released
    if (targetStages.includes('released')) {
      const testGateError = await validateTestGate(supabase, currentFeature.id);
      if (testGateError) return testGateError;
      const uatGateError = await checkUatReleaseGate(supabase, currentFeature.id);
      if (uatGateError) return uatGateError;
    }
  }

  return null;
}

async function validateTestGate(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response | null> {
  const { data: testCases } = await supabase
    .from('test_cases')
    .select('passed')
    .eq('feature_id', featureId);
  if (!testCases || testCases.length === 0) {
    return errorResponse('MISSING_TESTS', 'Cannot release: no test cases defined. Add test cases first.', 400);
  }
  const failedOrNotRun = testCases.filter((tc: { passed: boolean | null }) => tc.passed !== true);
  if (failedOrNotRun.length > 0) {
    return errorResponse('TESTS_NOT_PASSED', `Cannot release: ${failedOrNotRun.length} test(s) not passed. All tests must pass before releasing.`, 400);
  }
  return null;
}

/** Append new test cases to an existing feature (deduped) */
async function appendTestCases(
  supabase: SupabaseClient,
  feature: { id: string; feature_code: string },
  testCasesText: string,
  userId: string,
  now: string,
): Promise<void> {
  const parsedTestCases = parseTestCasesText(testCasesText);
  if (parsedTestCases.length === 0) return;

  console.log(
    'Processing',
    parsedTestCases.length,
    'test cases for',
    feature.feature_code,
  );

  const { data: existingFeatureTestCases } = await supabase
    .from('test_cases')
    .select('test_code, title')
    .eq('feature_id', feature.id);

  const existingTCCodes = (existingFeatureTestCases || []).map(
    (tc: { test_code: string }) => tc.test_code,
  );
  const existingTitles = (existingFeatureTestCases || []).map(
    (tc: { title: string }) => ({ title: tc.title }),
  );

  const { unique: uniqueTestCases, duplicates } = filterDuplicateTestCases(
    parsedTestCases,
    existingTitles,
  );

  if (duplicates.length > 0) {
    console.log('Skipping', duplicates.length, 'duplicate test cases:', duplicates);
  }

  for (const tc of uniqueTestCases) {
    const testCode = generateTestCaseCode(existingTCCodes, feature.feature_code);
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
  console.log(
    'Created',
    uniqueTestCases.length,
    'new test cases for',
    feature.feature_code,
  );
}
