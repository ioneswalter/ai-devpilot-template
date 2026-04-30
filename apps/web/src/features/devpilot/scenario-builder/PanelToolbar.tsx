/**
 * FR-141 — Toolbar inside the Scenario Builder panel: Generate, Save, Add-scenario.
 */

import type { CreateScenarioInput } from '@ownyourgig/types';
import { GenerateButton } from './GenerateButton';
import { AddScenarioMenu } from './AddScenarioMenu';

interface PanelToolbarProps {
  conversationId: string;
  hasExistingScenarios: boolean;
  isGenerating: boolean;
  generationError: Error | null;
  onGenerate: (mode: 'initial' | 'more') => void;
  draftCount: number;
  isCurating: boolean;
  onSaveClick: () => void;
  onAdd: (input: CreateScenarioInput) => Promise<unknown> | unknown;
  isAdding?: boolean;
}

export function PanelToolbar(props: PanelToolbarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b bg-gray-50">
      <GenerateButton
        hasExistingScenarios={props.hasExistingScenarios}
        isGenerating={props.isGenerating}
        error={props.generationError}
        onGenerate={props.onGenerate}
      />
      <button
        type="button"
        onClick={props.onSaveClick}
        disabled={props.draftCount === 0 || props.isCurating}
        className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
        aria-label="Save curated scenarios"
      >
        {props.isCurating ? 'Saving…' : 'Save scenarios'}
      </button>
      <div className="ml-auto">
        <AddScenarioMenu
          conversationId={props.conversationId}
          onAdd={props.onAdd}
          isAdding={props.isAdding}
        />
      </div>
    </div>
  );
}
