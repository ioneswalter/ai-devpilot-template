/**
 * FR-141 — Manual "Add scenario" escape hatch.
 * Intentionally less prominent than GenerateButton — manual creation is the exception, not the default.
 * Per memory feedback_bp_curates_ai_output: BPs curate AI output; manual creation stays a quiet escape hatch.
 */

import { useState } from 'react';
import type { CreateScenarioInput } from '@ownyourgig/types';
import { buildBlankScenario } from './scenarioFactory';

interface AddScenarioMenuProps {
  conversationId: string;
  onAdd: (input: CreateScenarioInput) => Promise<unknown> | unknown;
  isAdding?: boolean;
}

export function AddScenarioMenu({ conversationId, onAdd, isAdding }: AddScenarioMenuProps) {
  const [open, setOpen] = useState(false);

  const choose = (scenarioType: 'happy_path' | 'edge_case') => {
    void onAdd(buildBlankScenario(conversationId, scenarioType));
    setOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isAdding}
        className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        + Add scenario
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 w-44 rounded border border-gray-200 bg-white shadow-md py-1" role="menu">
          <button type="button" role="menuitem" onClick={() => choose('happy_path')} className="w-full text-left text-xs px-3 py-1.5 hover:bg-emerald-50 text-emerald-700">Happy path</button>
          <button type="button" role="menuitem" onClick={() => choose('edge_case')} className="w-full text-left text-xs px-3 py-1.5 hover:bg-amber-50 text-amber-700">Edge case</button>
        </div>
      )}
    </div>
  );
}
