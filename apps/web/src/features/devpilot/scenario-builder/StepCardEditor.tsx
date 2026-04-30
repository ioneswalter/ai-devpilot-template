/**
 * FR-141 — Inline editor for a single step.
 * Preserves the screen anchor; commits via onSave.
 */

import { useState } from 'react';
import type { ScenarioStep } from '@ownyourgig/types';

interface StepCardEditorProps {
  step: ScenarioStep;
  onSave: (next: { user_action: string; expected_outcome?: string }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

function validateInputs(action: string, outcome: string): string | null {
  const trimmed = action.trim();
  if (!trimmed) return 'User action is required.';
  if (trimmed.length > 500) return 'User action must be ≤ 500 characters.';
  if (outcome.length > 1000) return 'Expected outcome must be ≤ 1000 characters.';
  return null;
}

export function StepCardEditor({ step, onSave, onCancel, isSaving }: StepCardEditorProps) {
  const [userAction, setUserAction] = useState(step.user_action);
  const [expectedOutcome, setExpectedOutcome] = useState(step.expected_outcome ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const validation = validateInputs(userAction, expectedOutcome);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    onSave({
      user_action: userAction.trim(),
      expected_outcome: expectedOutcome.trim() ? expectedOutcome.trim() : undefined,
    });
  };

  return (
    <div className="space-y-2 p-2 border border-blue-200 bg-blue-50/40 rounded">
      <EditorField label="User action" value={userAction} onChange={setUserAction} />
      <EditorField label="Expected outcome" value={expectedOutcome} onChange={setExpectedOutcome} />
      {error && <div className="text-xs text-rose-600">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-3 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save edit'}
        </button>
      </div>
    </div>
  );
}

interface EditorFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
}

function EditorField({ label, value, onChange }: EditorFieldProps) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        aria-label={label}
      />
    </label>
  );
}
