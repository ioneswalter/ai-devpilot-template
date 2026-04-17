/**
 * Parse spec artifacts (spec.md) into individual reviewable items.
 * Extracts: acceptance scenarios, edge cases, and functional requirements.
 */

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function loadSpecArtifactItems(
  supabase: SupabaseClient,
  featureId: string,
  reviewId: string,
  startOrder: number,
  now: string,
) {
  const { data: artifacts } = await supabase
    .from('feature_spec_artifacts')
    .select('artifact_type, content')
    .eq('feature_id', featureId)
    .in('artifact_type', ['spec']);

  if (!artifacts || artifacts.length === 0) return [];

  const specContent = artifacts.find((a: { artifact_type: string }) => a.artifact_type === 'spec')?.content;
  if (!specContent) return [];

  const items: Array<{
    id: string; review_id: string; item_type: string; source: string;
    content: string; original_content: string; decision: string;
    sort_order: number; comments: never[]; created_at: string; updated_at: string;
  }> = [];
  let order = startOrder;

  // Extract acceptance scenarios (numbered items after **Acceptance Scenarios**: )
  const scenarioMatches = specContent.match(/\d+\.\s+\*\*Given\*\*[^\n]+/g) ?? [];
  for (const scenario of scenarioMatches) {
    const cleaned = scenario.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '');
    items.push({
      id: crypto.randomUUID(), review_id: reviewId, item_type: 'criterion',
      source: 'speckit', content: cleaned, original_content: cleaned,
      decision: 'pending', sort_order: order++, comments: [],
      created_at: now, updated_at: now,
    });
  }

  // Extract edge cases (lines starting with "- What happens when" or "- How does")
  const edgeCaseMatches = specContent.match(/^- (?:What happens when|How does)[^\n]+/gm) ?? [];
  for (const edgeCase of edgeCaseMatches) {
    const cleaned = edgeCase.replace(/^- /, '');
    const asCriteria = rephraseEdgeCaseAsCriteria(cleaned);
    items.push({
      id: crypto.randomUUID(), review_id: reviewId, item_type: 'edge_case',
      source: 'speckit', content: asCriteria, original_content: cleaned,
      decision: 'pending', sort_order: order++, comments: [],
      created_at: now, updated_at: now,
    });
  }

  // Extract functional requirements (lines matching **REQ-###**: )
  const reqMatches = specContent.match(/\*\*REQ-\d+\*\*:\s*[^\n]+/g) ?? [];
  for (const req of reqMatches) {
    const cleaned = req.replace(/\*\*/g, '');
    items.push({
      id: crypto.randomUUID(), review_id: reviewId, item_type: 'criterion',
      source: 'speckit', content: cleaned, original_content: cleaned,
      decision: 'pending', sort_order: order++, comments: [],
      created_at: now, updated_at: now,
    });
  }

  return items;
}

/**
 * Rephrase an edge case question into a testable acceptance criterion.
 */
function rephraseEdgeCaseAsCriteria(question: string): string {
  const whatHappens = question.match(/^What happens when (.+?)\??$/i);
  if (whatHappens) {
    const scenario = whatHappens[1].replace(/\.$/, '');
    return `The system handles the scenario where ${scenario} with appropriate feedback to the user`;
  }

  const howDoes = question.match(/^How does (?:the system |the app |it )?(.+?)\??$/i);
  if (howDoes) {
    const action = howDoes[1].replace(/\.$/, '');
    return `The system ${action} correctly and provides appropriate feedback`;
  }

  if (question.endsWith('?')) {
    return `The system ensures: ${question.slice(0, -1)}`;
  }

  return question;
}
