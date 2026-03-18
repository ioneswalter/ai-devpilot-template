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
}

const ENRICHMENT_PROMPT = `You are a senior product analyst reviewing a proposed feature specification.
Analyze the feature and generate structured enrichment suggestions.

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
- "criterion": Refined or additional acceptance criteria that strengthen the spec
- "test_case": Specific, testable scenarios with expected outcomes
- "edge_case": Boundary conditions, error states, or unusual scenarios to handle
- "description": Improvements to the feature description for clarity

Generate 3-5 items per type. Be specific and actionable. Focus on what's missing or could be improved.`;

/**
 * Call Claude AI to enrich a feature proposal with suggestions
 * Returns null if AI is unavailable (manual-only mode)
 */
export async function enrichFeature(
  title: string,
  description: string,
  criteria: string[],
): Promise<EnrichmentResult | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    console.warn('ANTHROPIC_API_KEY not set — skipping AI enrichment');
    return null;
  }

  const userMessage = `## Feature to Review

**Title:** ${title}
**Description:** ${description}

**Current Acceptance Criteria:**
${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'None defined yet.'}

Generate enrichment suggestions for this feature.`;

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
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

    return { items, raw_response: rawText };
  } catch (error) {
    console.error('Failed to parse AI enrichment response:', error);
    return null;
  }
}
