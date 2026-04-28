/**
 * AI Enrichment for Spec Review (FR-091)
 * Calls Claude to generate test cases, edge cases, and refined criteria
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

export interface EnrichmentItem {
  item_type: 'criterion' | 'test_case' | 'edge_case' | 'description';
  content: string;
}

export interface EnrichmentResult {
  items: EnrichmentItem[];
  raw_response: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

const AI_MODEL = 'claude-opus-4-6';

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
- "edge_case": Boundary conditions, error states, and security edge cases phrased as testable acceptance criteria (NOT as open-ended questions). Example: "The system prevents enrollment in archived courses and shows a clear message" instead of "What happens when a learner enrolls in an archived course?"
- "description": Improvements to the feature description for clarity and completeness

Generate 3-5 items per type. Be specific and actionable. Focus on:
1. Constitution compliance gaps (missing RLS, security, accessibility, performance criteria)
2. Cross-feature consistency (avoid duplicating what related features already cover)
3. Testability (vague criteria → specific measurable criteria)
4. Security & edge cases (OWASP Top 10, auth boundaries, data validation)`;

/** Additional context for constitution-aware enrichment (FR-121, Phase 3) */
export interface EnrichmentContext {
  constitution?: string;
  related_features?: string;
  existing_test_count?: number;
  learnings?: string;
}

/** Call Claude AI to enrich a feature proposal with suggestions. Returns null if AI unavailable. */
export async function enrichFeature(
  title: string,
  description: string,
  criteria: string[],
  context?: EnrichmentContext
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
  const learningsBlock = context?.learnings || '';

  const userMessage = `## Feature to Review

**Title:** ${title}
**Description:** ${description}

**Current Acceptance Criteria:**
${criteria.length > 0 ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'None defined yet.'}
${testNote}
${constitutionBlock}${relatedBlock}${learningsBlock}

Generate enrichment suggestions. Validate criteria against constitution principles. Flag any compliance gaps.`;

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: userMessage },
      ];

      if (attempt > 1) {
        messages.push(
          { role: 'assistant', content: '(previous attempt returned invalid JSON)' },
          {
            role: 'user',
            content:
              'Your previous response was not valid JSON. Return ONLY valid JSON with a "suggestions" array. No markdown, no code fences.',
          }
        );
      }

      const response = await Promise.race([
        anthropic.messages.create({
          model: AI_MODEL,
          max_tokens: 4096,
          system: ENRICHMENT_PROMPT,
          messages,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI enrichment timeout')), 30000)
        ),
      ]);

      logAIUsageFromEnv({
        featureId: 'spec-review',
        adminId: 'system',
        modelId: AI_MODEL,
        operationType: 'spec_review',
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });

      const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        console.error(`[Attempt ${attempt}/${MAX_ATTEMPTS}] No text block in AI response`);
        continue;
      }

      const rawText = textBlock.text;
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const result = parseEnrichmentResponse(rawText, inputTokens, outputTokens);

      if (result && result.items.length > 0) {
        if (attempt > 1) console.log(`[AI Enrichment] Succeeded on attempt ${attempt}`);
        return result;
      }

      console.warn(`[Attempt ${attempt}/${MAX_ATTEMPTS}] Enrichment parse failed or empty`);
    } catch (error) {
      console.error(`[Attempt ${attempt}/${MAX_ATTEMPTS}] AI enrichment failed:`, error);
    }
  }

  return null;
}

/**
 * Parse the AI JSON response into structured items
 */
function parseEnrichmentResponse(
  rawText: string,
  inputTokens = 0,
  outputTokens = 0
): EnrichmentResult | null {
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
      .filter((s) => validTypes.includes(s.item_type) && s.content?.trim())
      .map((s) => ({ item_type: s.item_type, content: s.content.trim() }));

    return {
      items,
      raw_response: rawText,
      model: AI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
  } catch (error) {
    console.error('Failed to parse AI enrichment response:', error);
    return null;
  }
}
