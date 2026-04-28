/**
 * Review Context Builder for Spec Review AI (FR-121)
 * Fetches constitution, related features, and existing test coverage
 * to give the AI deep context when enriching feature reviews.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface ReviewContext {
  constitution: string;
  related_features: RelatedFeature[];
  existing_test_count: number;
}

interface RelatedFeature {
  feature_code: string;
  title: string;
  status: string;
  acceptance_criteria: string[];
}

/** Compact constitution principles for review AI context */
const CONSTITUTION_FOR_REVIEW = `## Constitution Principles (validate criteria against these)
1. **TypeScript Strict Mode** (NON-NEGOTIABLE) — Zero \`any\` types. Prisma for type-safe DB. Zod for runtime validation.
2. **RLS on ALL tables** (NON-NEGOTIABLE) — Every new table MUST have Row Level Security policies.
3. **Max 300 lines/file** (NON-NEGOTIABLE) — Files exceeding 300 lines must be split.
4. **API-First Design** — RESTful Edge Functions. { data: T } / { error: { code, message } } response format.
5. **Accessibility (WCAG AA)** — Semantic HTML, ARIA labels, keyboard navigation, color contrast.
6. **Security (OWASP Top 10)** — Input validation on all endpoints. No secrets in code. CSRF protection.
7. **Performance** — < 2s page load, < 500ms API response. Code splitting. Lazy loading.
8. **Testing (80% coverage)** — Unit + component + integration tests with Vitest.
9. **Supabase Backend** — SMS OTP auth, Edge Functions (Deno), PostgreSQL + Prisma ORM.
10. **SOLID Principles** — SRP, meaningful names, no dead code, composition over inheritance.

## Validate Each Criterion Against:
- Does it comply with TypeScript strict mode? (no \`any\`, proper types)
- Does it require new DB tables? If so, RLS policies are mandatory.
- Is it testable and measurable? (not vague)
- Does it follow existing API patterns? (RESTful, consistent error handling)
- Does it have security implications? (input validation, auth, data exposure)`;

/**
 * Fetch review context: constitution, related features, test coverage
 */
export async function buildReviewContext(
  supabase: SupabaseClient,
  featureId: string,
  specSection: string | null,
  category: string | null
): Promise<ReviewContext> {
  // Fetch related features (same section or category)
  const related: RelatedFeature[] = [];

  if (specSection) {
    const { data: sectionFeatures } = await supabase
      .from('product_features')
      .select('feature_code, title, status, acceptance_criteria')
      .eq('spec_section', specSection)
      .neq('id', featureId)
      .in('status', ['released', 'specified', 'in_development'])
      .order('feature_code')
      .limit(10);

    for (const f of sectionFeatures ?? []) {
      related.push({
        feature_code: f.feature_code,
        title: f.title,
        status: f.status,
        acceptance_criteria: Array.isArray(f.acceptance_criteria) ? f.acceptance_criteria : [],
      });
    }
  }

  // Count existing test cases for this feature
  const { count } = await supabase
    .from('test_cases')
    .select('id', { count: 'exact', head: true })
    .eq('feature_id', featureId);

  return {
    constitution: CONSTITUTION_FOR_REVIEW,
    related_features: related,
    existing_test_count: count ?? 0,
  };
}

/** Format related features into a compact string for the AI prompt */
export function formatRelatedFeatures(features: RelatedFeature[]): string {
  if (features.length === 0) return '';
  const lines = features.map((f) => {
    const criteria = f.acceptance_criteria.slice(0, 3).join('; ');
    return `- ${f.feature_code}: "${f.title}" [${f.status}]${criteria ? ` — Criteria: ${criteria}` : ''}`;
  });
  return `\n## Related Features in Same Section\n${lines.join('\n')}`;
}
