/**
 * FR-141 — Helpers for building blank manual scenarios (Add-scenario escape hatch).
 * Manual creation is the exception path; default flow is AI generation.
 */

import type { CreateScenarioInput, ScenarioStep } from '@ownyourgig/types';

const PENDING_STEP: Omit<ScenarioStep, 'step_number' | 'expected_outcome'> = {
  user_action: 'Describe the first user action',
  decision: 'pending',
};

export function buildBlankScenario(
  conversationId: string,
  scenarioType: 'happy_path' | 'edge_case'
): CreateScenarioInput {
  const baseTitle = scenarioType === 'happy_path' ? 'New happy path' : 'New edge case';
  if (scenarioType === 'happy_path') {
    return {
      conversation_id: conversationId,
      scenario_type: 'happy_path',
      title: baseTitle,
      steps: [
        { step_number: 1, ...PENDING_STEP, expected_outcome: 'Describe the expected outcome' },
      ],
    } as CreateScenarioInput;
  }
  return {
    conversation_id: conversationId,
    scenario_type: 'edge_case',
    title: baseTitle,
    trigger_condition: 'Describe the trigger condition',
    expected_behavior: 'Describe the expected system behaviour',
    steps: [{ step_number: 1, ...PENDING_STEP }],
  } as CreateScenarioInput;
}
