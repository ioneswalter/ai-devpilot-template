/**
 * FR-141 — Storyboard for a single scenario: header + horizontally-scrolling step cards.
 */

import { useMemo, useState } from 'react';
import type { UATScenario, ScenarioStep, StepDecision } from '@ownyourgig/types';
import { StepCard } from './StepCard';
import { StoryboardHeader } from './StoryboardHeader';

interface ScenarioStoryboardProps {
  scenario: UATScenario;
  onPatchSteps: (steps: ScenarioStep[]) => Promise<unknown> | void;
  onDelete: () => Promise<unknown> | void;
  isSaving?: boolean;
}

function summariseDecisions(steps: ScenarioStep[]) {
  let accepted = 0,
    edited = 0,
    rejected = 0,
    pending = 0;
  for (const s of steps) {
    if (s.decision === 'accepted') accepted++;
    else if (s.decision === 'edited') edited++;
    else if (s.decision === 'rejected') rejected++;
    else pending++;
  }
  return { accepted, edited, rejected, pending };
}

export function ScenarioStoryboard({
  scenario,
  onPatchSteps,
  onDelete,
  isSaving,
}: ScenarioStoryboardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const counts = useMemo(() => summariseDecisions(scenario.steps), [scenario.steps]);

  const updateStep = (stepNumber: number, patch: Partial<ScenarioStep>) => {
    const next = scenario.steps.map((s) => (s.step_number === stepNumber ? { ...s, ...patch } : s));
    return onPatchSteps(next);
  };

  return (
    <section
      className="border border-gray-200 rounded-lg bg-white"
      data-testid="scenario-storyboard"
      data-scenario-type={scenario.scenario_type}
    >
      <StoryboardHeader
        scenario={scenario}
        counts={counts}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onDelete={onDelete}
        isSaving={isSaving}
      />
      {!collapsed && (
        <div className="p-3 overflow-x-auto">
          <div className="flex gap-3 min-w-max">
            {scenario.steps.map((step) => (
              <StepCard
                key={step.step_number}
                step={step}
                scenarioType={scenario.scenario_type}
                isSaving={isSaving}
                onDecisionChange={(decision: StepDecision) =>
                  updateStep(step.step_number, { decision })
                }
                onEditCommit={(next) =>
                  updateStep(step.step_number, {
                    user_action: next.user_action,
                    expected_outcome: next.expected_outcome,
                    decision: 'edited',
                    ai_original: step.ai_original ?? {
                      user_action: step.user_action,
                      expected_outcome: step.expected_outcome,
                    },
                  })
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
