/**
 * FR-141 — Visual card for a single step.
 * Three vertical regions: visual region (StepVisual) + action + expected outcome.
 * Decision strip wires per-step Accept/Edit/Reject.
 */

import { useState } from 'react';
import type { ScenarioStep, StepDecision } from '@ownyourgig/types';
import { DecisionStrip } from './DecisionStrip';
import { StepCardEditor } from './StepCardEditor';
import { StepVisual } from './StepVisual';

interface StepCardProps {
  step: ScenarioStep;
  scenarioType: 'happy_path' | 'edge_case';
  onDecisionChange: (decision: StepDecision) => void;
  onEditCommit: (next: { user_action: string; expected_outcome?: string }) => Promise<unknown> | void;
  isSaving?: boolean;
}

const DECISION_BORDER: Record<StepDecision, string> = {
  pending: 'border-gray-200',
  accepted: 'border-emerald-400',
  edited: 'border-blue-400',
  rejected: 'border-rose-300 opacity-60',
};

export function StepCard({ step, scenarioType, onDecisionChange, onEditCommit, isSaving }: StepCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleEditStart = () => {
    setIsEditing(true);
    if (step.decision !== 'edited') onDecisionChange('edited');
  };

  const handleEditSave = async (next: { user_action: string; expected_outcome?: string }) => {
    await onEditCommit(next);
    setIsEditing(false);
  };

  return (
    <div
      className={`shrink-0 w-72 rounded-lg border ${DECISION_BORDER[step.decision]} bg-white shadow-sm overflow-hidden`}
      data-testid="step-card"
      data-step-decision={step.decision}
    >
      <StepVisual scenarioType={scenarioType} stepNumber={step.step_number} />
      <div className="p-3 space-y-2">
        {isEditing ? (
          <StepCardEditor step={step} onSave={handleEditSave} onCancel={() => setIsEditing(false)} isSaving={isSaving} />
        ) : (
          <StepBody
            step={step}
            disabled={isSaving}
            onAccept={() => onDecisionChange('accepted')}
            onEdit={handleEditStart}
            onReject={() => onDecisionChange('rejected')}
          />
        )}
      </div>
    </div>
  );
}

interface StepBodyProps {
  step: ScenarioStep;
  disabled?: boolean;
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
}

function StepBody({ step, disabled, onAccept, onEdit, onReject }: StepBodyProps) {
  return (
    <>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-400">Action</div>
        <div className="text-sm text-gray-800 leading-snug">{step.user_action}</div>
      </div>
      {step.expected_outcome && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Expected outcome</div>
          <div className="text-sm text-gray-700 leading-snug">{step.expected_outcome}</div>
        </div>
      )}
      <DecisionStrip decision={step.decision} onAccept={onAccept} onEdit={onEdit} onReject={onReject} disabled={disabled} />
    </>
  );
}
