/**
 * Approve Review handler (FR-091 — Journey 2)
 * Approves a feature, merges accepted items into the feature, creates test cases
 */

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface ApproveReviewParams {
  reviewId: string;
  version: number;
  userId: string;
  supabase: SupabaseClient;
}

/**
 * Generate next available test case code for a feature
 * Format: TC-{feature_number}-{sequence}
 */
function generateTestCaseCode(existingCodes: string[], featureCode: string): string {
  const featureNumMatch = featureCode.match(/(?:FR|J)-(\d+)/);
  const featureNum = featureNumMatch ? featureNumMatch[1] : '000';
  const prefix = `TC-${featureNum}-`;

  const numbers = existingCodes
    .filter((c) => c.startsWith(prefix))
    .map((c) => {
      const match = c.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n > 0);

  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
}

export async function handleApproveReview({
  reviewId,
  version,
  userId,
  supabase,
}: ApproveReviewParams): Promise<{
  data?: unknown;
  error?: { code: string; message: string };
  status: number;
}> {
  // 1. Fetch review
  const { data: review, error: reviewErr } = await supabase
    .from('spec_reviews')
    .select('id, feature_id, status, version')
    .eq('id', reviewId)
    .single();

  if (reviewErr || !review) {
    return { error: { code: 'REVIEW_NOT_FOUND', message: 'Review does not exist' }, status: 404 };
  }

  if (review.status !== 'in_review') {
    return {
      error: { code: 'REVIEW_COMPLETED', message: `Review is already ${review.status}` },
      status: 422,
    };
  }

  if (review.version !== version) {
    return {
      error: { code: 'VERSION_CONFLICT', message: 'Review was modified by another user' },
      status: 409,
    };
  }

  // 2. Get all accepted/modified items
  const { data: items } = await supabase
    .from('review_items')
    .select('*')
    .eq('review_id', reviewId)
    .in('decision', ['accepted', 'modified']);

  if (!items || items.length === 0) {
    return {
      error: {
        code: 'NO_ACCEPTED_ITEMS',
        message: 'No items were accepted — cannot approve with empty spec',
      },
      status: 422,
    };
  }

  // 3. Separate criteria and test cases
  const acceptedCriteria = items
    .filter((i) => i.item_type === 'criterion' || i.item_type === 'description')
    .map((i) => i.content);

  const acceptedTestCases = items
    .filter((i) => i.item_type === 'test_case' || i.item_type === 'edge_case')
    .map((i) => ({ title: i.content, type: i.item_type }));

  // 4. Get feature details
  const { data: feature, error: featureErr } = await supabase
    .from('product_features')
    .select('id, feature_code, acceptance_criteria')
    .eq('id', review.feature_id)
    .single();

  if (featureErr || !feature) {
    return { error: { code: 'FEATURE_NOT_FOUND', message: 'Feature not found' }, status: 404 };
  }

  const now = new Date().toISOString();

  // 5. Update feature: merge criteria, change status to "specified"
  const { error: featureUpdateErr } = await supabase
    .from('product_features')
    .update({
      acceptance_criteria: acceptedCriteria,
      status: 'specified',
      updated_at: now,
    })
    .eq('id', feature.id);

  if (featureUpdateErr) {
    console.error('Failed to update feature:', featureUpdateErr);
    return { error: { code: 'DATABASE_ERROR', message: 'Failed to update feature' }, status: 500 };
  }

  // 6. Create test_cases records
  let testCasesCreated = 0;

  if (acceptedTestCases.length > 0) {
    const { data: existingTC } = await supabase
      .from('test_cases')
      .select('test_code')
      .eq('feature_id', feature.id);

    const existingCodes = (existingTC || []).map((tc) => tc.test_code);

    for (const tc of acceptedTestCases) {
      const testCode = generateTestCaseCode(existingCodes, feature.feature_code);
      existingCodes.push(testCode);

      const { error: tcErr } = await supabase.from('test_cases').insert({
        id: crypto.randomUUID(),
        test_code: testCode,
        feature_id: feature.id,
        title: tc.title,
        test_type: tc.type === 'edge_case' ? 'edge_case' : 'manual',
        priority: 'medium',
        status: 'draft',
        automated: false,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      if (!tcErr) testCasesCreated++;
    }
  }

  // 7. Update review status to "approved"
  await supabase
    .from('spec_reviews')
    .update({ status: 'approved', updated_at: now })
    .eq('id', reviewId);

  console.log(
    `Review ${reviewId} approved — ${acceptedCriteria.length} criteria, ${testCasesCreated} test cases created`
  );

  return {
    data: {
      feature: {
        id: feature.id,
        feature_code: feature.feature_code,
        status: 'specified',
        acceptance_criteria: acceptedCriteria,
        updated_at: now,
      },
      test_cases_created: testCasesCreated,
      review: { id: reviewId, status: 'approved', updated_at: now },
    },
    status: 200,
  };
}
