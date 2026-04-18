/**
 * DELETE, GET, and request-implementation handlers
 */

import type { SupabaseClient } from './shared.ts';
import {
  RequestImplementationSchema,
  errorResponse,
  jsonResponse,
} from './shared.ts';

/** POST /request-implementation — Request AI to implement a feature */
export async function handleRequestImplementation(
  req: Request,
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
): Promise<Response> {
  const rawBody = await req.json();
  const validation = RequestImplementationSchema.safeParse(rawBody);

  if (!validation.success) {
    return errorResponse(
      'VALIDATION_ERROR',
      validation.error.errors[0].message,
      400,
    );
  }

  const { feature_id, implementation_notes } = validation.data;

  // Get feature details
  const { data: feature, error: featureError } = await supabase
    .from('product_features')
    .select('*')
    .eq('id', feature_id)
    .single();

  if (featureError || !feature) {
    return errorResponse('NOT_FOUND', 'Feature not found', 404);
  }

  // Update feature status to in_development
  await supabase
    .from('product_features')
    .update({ status: 'in_development' })
    .eq('id', feature_id);

  const implementationPrompt = `
## Feature Implementation Request

**Feature Code:** ${feature.feature_code}
**Title:** ${feature.title}
**Description:** ${feature.description}
**Priority:** ${feature.priority}
**Type:** ${feature.feature_type}

### Acceptance Criteria:
${(feature.acceptance_criteria || []).map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

### Implementation Notes:
${implementation_notes || 'No additional notes provided.'}

### Instructions:
Please implement this feature following the project's coding standards and patterns.
Create test cases for each acceptance criterion.
Update the roadmap when complete.
  `.trim();

  console.log(
    'AI Implementation requested for:',
    feature.feature_code,
    'by',
    userEmail,
  );
  console.log('Implementation prompt:', implementationPrompt);

  return jsonResponse({
    feature_code: feature.feature_code,
    title: feature.title,
    status: 'in_development',
    implementation_prompt: implementationPrompt,
    message:
      'Feature queued for AI implementation. Use the implementation prompt to guide the AI assistant.',
  });
}

/** DELETE — Delete a feature (only if status is proposed or approved) */
export async function handleDeleteFeature(
  req: Request,
  supabase: SupabaseClient,
  userEmail: string | undefined,
): Promise<Response> {
  const url = new URL(req.url);
  const featureId = url.searchParams.get('feature_id');

  if (!featureId) {
    return errorResponse(
      'VALIDATION_ERROR',
      'feature_id is required',
      400,
    );
  }

  // Get feature to check status
  const { data: existingFeature, error: fetchError } = await supabase
    .from('product_features')
    .select('feature_code, status')
    .eq('id', featureId)
    .single();

  if (fetchError || !existingFeature) {
    return errorResponse('NOT_FOUND', 'Feature not found', 404);
  }

  if (!['proposed', 'specified'].includes(existingFeature.status)) {
    return errorResponse(
      'FORBIDDEN',
      'Cannot delete features that are in development or released',
      403,
    );
  }

  // Delete related comments and ratings first
  await supabase.from('feature_comments').delete().eq('feature_id', featureId);
  await supabase.from('feature_ratings').delete().eq('feature_id', featureId);

  // Delete the feature
  const { error: deleteError } = await supabase
    .from('product_features')
    .delete()
    .eq('id', featureId);

  if (deleteError) {
    console.error('Error deleting feature:', deleteError);
    return errorResponse('DATABASE_ERROR', 'Failed to delete feature', 500);
  }

  console.log(
    'Admin deleted feature:',
    existingFeature.feature_code,
    'by',
    userEmail,
  );

  return jsonResponse({
    deleted: true,
    feature_code: existingFeature.feature_code,
  });
}

/** GET — Check if current user is admin (already verified by router) */
export function handleGetAdmin(userEmail: string | undefined): Response {
  return jsonResponse({
    is_admin: true,
    email: userEmail,
  });
}
