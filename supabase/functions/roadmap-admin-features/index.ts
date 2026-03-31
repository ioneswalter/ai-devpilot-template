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
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const CreateFeatureSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().min(1, 'description is required'),
  feature_type: z.string().optional().default('functional_requirement'),
  priority: z.string().optional().default('P2'),
  acceptance_criteria_text: z.string().optional().default(''),
  acceptance_criteria: z.array(z.string()).optional().default([]),
  category: z.string().nullable().optional().default(null),
  spec_section: z.string().optional().default('New Features'),
  related_user_stories: z.array(z.string()).optional().default([]),
  test_cases_text: z.string().optional().default(''),
});

const RequestImplementationSchema = z.object({
  feature_id: z.string().uuid('feature_id is required'),
  implementation_notes: z.string().optional(),
});

const UpdateFeatureSchema = z.object({
  feature_id: z.string().uuid('feature_id is required'),
  test_cases_text: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  feature_type: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
  spec_section: z.string().optional(),
  related_user_stories: z.array(z.string()).optional(),
  implementing_features: z.array(z.string()).optional(),
});

async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string, userEmail: string | undefined): Promise<boolean> {
  // Check by user_id first (more reliable for phone auth users)
  const { data: adminById } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (adminById) return true;

  // Fallback to email check
  if (userEmail) {
    const { data: adminByEmail } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', userEmail)
      .single();

    if (adminByEmail) return true;
  }

  return false;
}

/**
 * Generate next available feature code, recycling deleted codes
 * Finds the lowest available gap in the sequence (e.g., if FR-031 was deleted, reuse it)
 */
function generateFeatureCode(existingCodes: string[], type: 'feature' | 'journey'): string {
  const prefix = type === 'journey' ? 'J-' : 'FR-';
  const relevantCodes = existingCodes.filter(c => c.startsWith(prefix));

  // Extract all existing numbers and sort them
  const existingNumbers: number[] = [];
  for (const code of relevantCodes) {
    const num = parseInt(code.replace(prefix, ''), 10);
    if (!isNaN(num) && num > 0) {
      existingNumbers.push(num);
    }
  }
  existingNumbers.sort((a, b) => a - b);

  // Find the first gap in the sequence (recycled code)
  let nextNumber = 1;
  for (const num of existingNumbers) {
    if (num === nextNumber) {
      nextNumber++;
    } else if (num > nextNumber) {
      // Found a gap - use this number
      break;
    }
  }

  // If no gap found, nextNumber is already maxNumber + 1
  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

/**
 * Simple text parsing fallback for acceptance criteria
 */
function simpleParseCriteria(text: string): string[] {
  // Split by newlines, bullet points, or numbered items
  return text
    .split(/[\n\r]+|(?:^|\s)[-•*]\s|(?:^|\s)\d+[.)]\s/m)
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .map(s => s.replace(/^[-•*\d.)]+\s*/, '').trim());
}

/**
 * Parse free-text acceptance criteria into structured list
 * Uses simple text parsing (AI can be enabled later)
 */
function parseAcceptanceCriteria(text: string): string[] {
  if (!text.trim()) return [];
  return simpleParseCriteria(text);
}

interface ParsedTestCase {
  title: string;
  test_type: string;
  priority: string;
}

/**
 * Parse test cases text into structured test case objects
 * Supports prefixes like [e2e], [unit], [manual], [integration]
 */
function parseTestCasesText(text: string): ParsedTestCase[] {
  if (!text.trim()) return [];

  return text
    .split(/[\n\r]+/)
    .map(line => line.trim())
    .filter(line => line.length > 5)
    .map(line => {
      // Check for type prefix like [e2e], [unit], [manual], [integration]
      const typeMatch = line.match(/^\[(\w+)\]\s*/i);
      let test_type = 'manual';
      let title = line;

      if (typeMatch) {
        const prefix = typeMatch[1].toLowerCase();
        title = line.replace(typeMatch[0], '').trim();

        if (['e2e', 'end-to-end', 'end2end'].includes(prefix)) {
          test_type = 'e2e';
        } else if (['unit', 'unittest'].includes(prefix)) {
          test_type = 'unit';
        } else if (['integration', 'int'].includes(prefix)) {
          test_type = 'integration';
        } else if (['manual', 'qa'].includes(prefix)) {
          test_type = 'manual';
        } else if (['accessibility', 'a11y'].includes(prefix)) {
          test_type = 'accessibility';
        }
      }

      // Clean up title - remove leading bullets/numbers
      title = title.replace(/^[-•*\d.)]+\s*/, '').trim();

      return {
        title,
        test_type,
        priority: 'medium',
      };
    })
    .filter(tc => tc.title.length > 0);
}

/**
 * Generate next available test case code for a specific feature
 * Format: TC-{feature_number}-{sequence} (e.g., TC-054-001 for FR-054)
 */
function generateTestCaseCode(existingCodes: string[], featureCode: string): string {
  // Extract feature number from feature code (FR-054 -> 054, J-006 -> 006)
  const featureNumMatch = featureCode.match(/(?:FR|J)-(\d+)/);
  const featureNum = featureNumMatch ? featureNumMatch[1] : '000';

  const prefix = `TC-${featureNum}-`;

  // Find existing codes for this feature
  const featureTcNumbers = existingCodes
    .filter(c => c.startsWith(prefix))
    .map(c => {
      const match = c.match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => !isNaN(n) && n > 0);

  const maxNumber = featureTcNumbers.length > 0 ? Math.max(...featureTcNumbers) : 0;
  return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
}

/**
 * Normalize a test case title for comparison (lowercase, remove punctuation, trim)
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two test case titles are duplicates (similar enough to be considered the same)
 */
function isDuplicateTitle(newTitle: string, existingTitle: string): boolean {
  const normalizedNew = normalizeTitle(newTitle);
  const normalizedExisting = normalizeTitle(existingTitle);

  // Exact match after normalization
  if (normalizedNew === normalizedExisting) return true;

  // One is a substring of the other (for minor variations)
  if (normalizedNew.includes(normalizedExisting) || normalizedExisting.includes(normalizedNew)) {
    // Only if the length difference is small (< 20%)
    const lenDiff = Math.abs(normalizedNew.length - normalizedExisting.length);
    const maxLen = Math.max(normalizedNew.length, normalizedExisting.length);
    if (lenDiff / maxLen < 0.2) return true;
  }

  return false;
}

/**
 * Filter out duplicate test cases based on existing test cases for the feature
 */
function filterDuplicateTestCases(
  newTestCases: ParsedTestCase[],
  existingTestCases: { title: string }[]
): { unique: ParsedTestCase[]; duplicates: string[] } {
  const unique: ParsedTestCase[] = [];
  const duplicates: string[] = [];

  for (const tc of newTestCases) {
    const isDupe = existingTestCases.some(existing =>
      isDuplicateTitle(tc.title, existing.title)
    );

    if (isDupe) {
      duplicates.push(tc.title);
    } else {
      // Also check against already-added unique items
      const isDupeInUnique = unique.some(u => isDuplicateTitle(tc.title, u.title));
      if (!isDupeInUnique) {
        unique.push(tc);
      } else {
        duplicates.push(tc.title);
      }
    }
  }

  return { unique, duplicates };
}

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
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin (check by user_id and email)
    const adminCheck = await isAdmin(supabase, user.id, user.email);
    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1];

    // POST - Create a new feature or journey
    if (req.method === 'POST' && action !== 'request-implementation') {
      const rawBody = await req.json();
      const validation = CreateFeatureSchema.safeParse(rawBody);

      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: validation.error.errors[0].message } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
      const { data: existingFeatures } = await supabase
        .from('product_features')
        .select('feature_code');

      const existingCodes = (existingFeatures || []).map(f => f.feature_code);
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
          created_by: user.id,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating feature:', insertError);
        return new Response(
          JSON.stringify({ error: { code: 'DATABASE_ERROR', message: 'Failed to create feature' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create test cases if provided
      if (test_cases_text.trim()) {
        const parsedTestCases = parseTestCasesText(test_cases_text);
        if (parsedTestCases.length > 0) {
          console.log('Creating', parsedTestCases.length, 'test cases for', featureCode);

          // Get existing test case codes for this feature
          const { data: existingTestCases } = await supabase
            .from('test_cases')
            .select('test_code, title')
            .eq('feature_id', feature.id);

          const existingTCCodes = (existingTestCases || []).map(tc => tc.test_code);
          const existingTitles = (existingTestCases || []).map(tc => ({ title: tc.title }));

          // Filter out duplicates
          const { unique: uniqueTestCases, duplicates } = filterDuplicateTestCases(parsedTestCases, existingTitles);

          if (duplicates.length > 0) {
            console.log('Skipping', duplicates.length, 'duplicate test cases:', duplicates);
          }

          // Create unique test cases
          for (const tc of uniqueTestCases) {
            const testCode = generateTestCaseCode(existingTCCodes, featureCode);
            existingTCCodes.push(testCode); // Add to list to avoid duplicates

            await supabase.from('test_cases').insert({
              id: crypto.randomUUID(),
              test_code: testCode,
              feature_id: feature.id,
              title: tc.title,
              test_type: tc.test_type,
              priority: tc.priority,
              status: 'draft',
              automated: false,
              created_by: user.id,
              created_at: now,
              updated_at: now,
            });
          }
          console.log('Created', uniqueTestCases.length, 'test cases for', featureCode);
        }
      }

      console.log('Admin created feature:', featureCode, 'by', user.email);

      return new Response(
        JSON.stringify({ data: feature }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /request-implementation - Request AI to implement a feature
    if (req.method === 'POST' && action === 'request-implementation') {
      const rawBody = await req.json();
      const validation = RequestImplementationSchema.safeParse(rawBody);

      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: validation.error.errors[0].message } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Feature not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update feature status to in_development
      await supabase
        .from('product_features')
        .update({ status: 'in_development' })
        .eq('id', feature_id);

      // Create a notification or record for the AI implementation request
      // This creates a structured prompt that can be used by the AI assistant
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

      console.log('AI Implementation requested for:', feature.feature_code, 'by', user.email);
      console.log('Implementation prompt:', implementationPrompt);

      return new Response(
        JSON.stringify({
          data: {
            feature_code: feature.feature_code,
            title: feature.title,
            status: 'in_development',
            implementation_prompt: implementationPrompt,
            message: 'Feature queued for AI implementation. Use the implementation prompt to guide the AI assistant.',
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH - Update a feature
    if (req.method === 'PATCH') {
      const rawBody = await req.json();
      const validation = UpdateFeatureSchema.safeParse(rawBody);

      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: validation.error.errors[0].message } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { feature_id, test_cases_text, ...updates } = validation.data;

      // Only allow updating certain fields
      const allowedFields = [
        'title', 'description', 'feature_type', 'priority', 'status', 'acceptance_criteria',
        'category', 'spec_section', 'related_user_stories', 'implementing_features'
      ];

      const filteredUpdates: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (field in updates) {
          filteredUpdates[field] = updates[field];
        }
      }

      // Validate status transitions if status is changing
      if ('status' in filteredUpdates) {
        const newStatus = filteredUpdates.status as string;
        const statusOrder = ['proposed', 'approved', 'in_development', 'released'];

        // Get current feature to check transition
        const { data: currentFeature, error: fetchError } = await supabase
          .from('product_features')
          .select('status, acceptance_criteria, id')
          .eq('id', feature_id)
          .single();

        if (fetchError || !currentFeature) {
          return new Response(
            JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Feature not found' } }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const fromIndex = statusOrder.indexOf(currentFeature.status);
        const toIndex = statusOrder.indexOf(newStatus);

        // Forward transitions must be exactly one step
        if (toIndex > fromIndex && toIndex !== fromIndex + 1) {
          return new Response(
            JSON.stringify({ error: { code: 'INVALID_TRANSITION', message: `Cannot skip from ${currentFeature.status} to ${newStatus}. Transition one step at a time.` } }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate requirements for forward transitions
        if (toIndex > fromIndex) {
          if (newStatus === 'released') {
            // Must have at least 1 test case, all must pass
            const { data: testCases } = await supabase
              .from('test_cases')
              .select('passed')
              .eq('feature_id', currentFeature.id);

            if (!testCases || testCases.length === 0) {
              return new Response(
                JSON.stringify({ error: { code: 'MISSING_TESTS', message: 'Cannot release: no test cases defined. Add test cases first.' } }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            const failedOrNotRun = testCases.filter(tc => tc.passed !== true);
            if (failedOrNotRun.length > 0) {
              return new Response(
                JSON.stringify({ error: { code: 'TESTS_NOT_PASSED', message: `Cannot release: ${failedOrNotRun.length} test(s) not passed. All tests must pass before releasing.` } }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          if (newStatus === 'approved' || newStatus === 'in_development') {
            // Must have acceptance criteria
            const criteria = currentFeature.acceptance_criteria as string[] | null;
            if (!criteria || criteria.length === 0) {
              return new Response(
                JSON.stringify({ error: { code: 'MISSING_CRITERIA', message: `Cannot move to ${newStatus}: no acceptance criteria defined.` } }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }
      }

      // Allow update even if only test_cases_text is provided
      const hasTestCases = test_cases_text && test_cases_text.trim();
      if (Object.keys(filteredUpdates).length === 0 && !hasTestCases) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const now = new Date().toISOString();
      filteredUpdates.updated_at = now;

      // Feature Versioning (I2-04): Snapshot current state before applying edits
      try {
        const { data: current } = await supabase
          .from('product_features')
          .select('id, title, description, acceptance_criteria, status, category')
          .eq('id', feature_id)
          .single();

        if (current) {
          const { data: lastVersion } = await supabase
            .from('feature_versions')
            .select('version_number')
            .eq('feature_id', feature_id)
            .order('version_number', { ascending: false })
            .limit(1)
            .single();

          const nextVersion = (lastVersion?.version_number ?? 0) + 1;
          const changedFields = Object.keys(filteredUpdates).filter(k => k !== 'updated_at');

          await supabase.from('feature_versions').insert({
            id: crypto.randomUUID(),
            feature_id,
            version_number: nextVersion,
            title: current.title,
            description: current.description,
            acceptance_criteria: current.acceptance_criteria,
            status: current.status,
            category: current.category,
            change_summary: `Fields updated: ${changedFields.join(', ')}`,
            changed_by: user.id,
          });
        }
      } catch (versionError) {
        // Non-blocking — don't fail the edit if versioning fails
        console.warn('Feature versioning snapshot failed:', versionError);
      }

      const { data: feature, error: updateError } = await supabase
        .from('product_features')
        .update(filteredUpdates)
        .eq('id', feature_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating feature:', updateError);
        return new Response(
          JSON.stringify({ error: { code: 'DATABASE_ERROR', message: 'Failed to update feature' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle test cases if provided
      if (hasTestCases) {
        const parsedTestCases = parseTestCasesText(test_cases_text);
        if (parsedTestCases.length > 0) {
          console.log('Processing', parsedTestCases.length, 'test cases for', feature.feature_code);

          // Get existing test cases for this feature (for duplicate detection and code generation)
          const { data: existingFeatureTestCases } = await supabase
            .from('test_cases')
            .select('test_code, title')
            .eq('feature_id', feature.id);

          const existingTCCodes = (existingFeatureTestCases || []).map(tc => tc.test_code);
          const existingTitles = (existingFeatureTestCases || []).map(tc => ({ title: tc.title }));

          // Filter out duplicates
          const { unique: uniqueTestCases, duplicates } = filterDuplicateTestCases(parsedTestCases, existingTitles);

          if (duplicates.length > 0) {
            console.log('Skipping', duplicates.length, 'duplicate test cases:', duplicates);
          }

          // Create unique test cases (append to existing)
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
              created_by: user.id,
              created_at: now,
              updated_at: now,
            });
          }
          console.log('Created', uniqueTestCases.length, 'new test cases for', feature.feature_code);
        }
      }

      console.log('Admin updated feature:', feature.feature_code, 'by', user.email);

      return new Response(
        JSON.stringify({ data: feature }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE - Delete a feature (only if status is 'proposed' or 'roadmap')
    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const featureId = url.searchParams.get('feature_id');

      if (!featureId) {
        return new Response(
          JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'feature_id is required' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get feature to check status
      const { data: existingFeature, error: fetchError } = await supabase
        .from('product_features')
        .select('feature_code, status')
        .eq('id', featureId)
        .single();

      if (fetchError || !existingFeature) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Feature not found' } }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Only allow deleting features with status 'proposed' or 'approved'
      if (!['proposed', 'approved'].includes(existingFeature.status)) {
        return new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Cannot delete features that are in development or released' } }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        return new Response(
          JSON.stringify({ error: { code: 'DATABASE_ERROR', message: 'Failed to delete feature' } }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Admin deleted feature:', existingFeature.feature_code, 'by', user.email);

      return new Response(
        JSON.stringify({ data: { deleted: true, feature_code: existingFeature.feature_code } }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET - Check if current user is admin
    if (req.method === 'GET') {
      return new Response(
        JSON.stringify({
          data: {
            is_admin: true,
            email: user.email,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('roadmap-admin-features error:', error);
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
