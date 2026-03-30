/**
 * AI Enrichment for Spec Review (FR-091)
 * Calls Claude to generate test cases, edge cases, and refined criteria
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

export interface EnrichmentItem {
  item_type: 'criterion' | 'test_case' | 'edge_case' | 'description';
  content: string;
}

export interface EnrichmentResult {
  items: EnrichmentItem[];
  raw_response: string;
  model: string;
}

const AI_MODEL = 'claude-opus-4-1-20250805';

const ENRICHMENT_PROMPT = `You are a senior product analyst reviewing a proposed feature specification for the OwnYourGig platform.
Analyze the feature against the constitution principles and generate structured enrichment suggestions.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "suggestions": [
    { "item_type": "criterion", "content": "..." },
    { "item_type": "test_case", "content": "..." },
    { "item_type": "edge_case", "content": "..." },
    { "item_type": "description", "content": "..." }
  ]
}

Guidelines:
- "criterion": Refined or additional acceptance criteria. MUST be testable, specific, and constitution-compliant (e.g., RLS policies, input validation, type safety)
- "test_case": Specific, testable scenarios with expected outcomes. Check for security, accessibility, and performance requirements from the constitution
- "edge_case": Boundary conditions, error states, security edge cases (unauthorized access, invalid input, concurrent operations)
- "description": Improvements to the feature description for clarity and completeness

Generate 3-5 items per type. Be specific and actionable. Focus on:
1. Constitution compliance gaps (missing RLS, security, accessibility, performance criteria)
2. Cross-feature consistency (avoid duplicating what related features already cover)
3. Testability (vague criteria → specific measurable criteria)
4. Security & edge cases (OWASP Top 10, auth boundaries, data validation)`;

/** Additional context for constitution-aware enrichment (FR-121) */
export interface EnrichmentContext {
  constitution?: string;
  related_features?: string;
  existing_test_count?: number;
}

/** Call Claude AI to enrich a feature proposal with suggestions. Returns null if AI unavailable. */
export async function enrichFeature(
  title: string,
  description: string,
  criteria: string[],
  context?: EnrichmentContext,
): Promise<EnrichmentResult | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    console.warn('ANTHROPIC_API_KEY not set — skipping AI enrichment');
    return null;
  }

  const constitutionBlock = context?.constitution ? `\n${context.constitution}\n` : '';
  const relatedBlock = context?.related_features || '';
  const testNote = context?.existing_test_count
    ? `\n**Existing Test Cases:** ${context.existing_test_count} (avoid duplicating these)`
    : '';

  const userMessage = `## Feature to Review

**Title:** ${title}
**Description:** ${description}

**Current Acceptance Criteria:**
${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'None defined yet.'}
${testNote}
${constitutionBlock}${relatedBlock}

Generate enrichment suggestions. Validate criteria against constitution principles. Flag any compliance gaps.`;

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const response = await Promise.race([
      anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 4096,
        system: ENRICHMENT_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI enrichment timeout')), 30000)
      ),
    ]);

    const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('No text block in AI response');
      return null;
    }

    const rawText = textBlock.text;
    return parseEnrichmentResponse(rawText);
  } catch (error) {
    console.error('AI enrichment failed:', error);
    return null;
  }
}

/**
 * Parse the AI JSON response into structured items
 */
function parseEnrichmentResponse(rawText: string): EnrichmentResult | null {
  try {
    // Try direct JSON parse first
    let parsed: { suggestions?: EnrichmentItem[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Try extracting JSON from markdown code fences
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        console.error('Could not extract JSON from AI response');
        return null;
      }
      parsed = JSON.parse(jsonMatch[1].trim());
    }

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      console.error('Invalid AI response structure — missing suggestions array');
      return null;
    }

    const validTypes = ['criterion', 'test_case', 'edge_case', 'description'];
    const items = parsed.suggestions
      .filter(s => validTypes.includes(s.item_type) && s.content?.trim())
      .map(s => ({ item_type: s.item_type, content: s.content.trim() }));

    return { items, raw_response: rawText, model: AI_MODEL };
  } catch (error) {
    console.error('Failed to parse AI enrichment response:', error);
    return null;
  }
}
