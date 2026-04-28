/**
 * Role-Panel Mapping (FR-135)
 * Maps pipeline stages and panels to required allowed_actions.
 * A panel is visible if the user's allowed_actions includes ANY of the panel's required actions.
 */

import type { PipelineStageName } from './pipeline-types';

/** Actions that grant access to each pipeline stage panel */
const STAGE_REQUIRED_ACTIONS: Record<PipelineStageName, readonly string[]> = {
  spec: ['spec_review', 'view_pipeline'],
  build: ['build', 'fix_build', 'view_pipeline'],
  test: ['test', 'fix_test', 'view_pipeline'],
  // FR-130 v2.0 / J10: UAT panel visible to BP, SE, Admin (anyone who can review or pick up fix-cycle tasks).
  uat: ['uat_review', 'fix_build', 'view_pipeline'],
  deploy: ['deploy', 'view_pipeline'],
};

/** Check if a set of allowed actions grants access to a pipeline stage */
export function canAccessStage(
  allowedActions: readonly string[],
  stage: PipelineStageName
): boolean {
  const required = STAGE_REQUIRED_ACTIONS[stage];
  return required.some((action) => allowedActions.includes(action));
}

/** Check access for all stages at once */
export function getAccessibleStages(allowedActions: readonly string[]): Set<PipelineStageName> {
  const stages: PipelineStageName[] = ['spec', 'build', 'test', 'uat', 'deploy'];
  return new Set(stages.filter((s) => canAccessStage(allowedActions, s)));
}
