/**
 * FR-141 — Top-level Scenario Builder side panel.
 * Composes header, toolbar, error strip, save-confirm banner, and body.
 * State + orchestration lives in usePanelState for size discipline.
 */

import { PanelHeader } from './PanelHeader';
import { PanelToolbar } from './PanelToolbar';
import { PanelBody } from './PanelBody';
import { PanelErrors } from './PanelErrors';
import { SaveConfirmBanner } from './SaveConfirmBanner';
import { usePanelState } from './usePanelState';

interface ScenarioBuilderPanelProps {
  conversationId: string;
  onClose: () => void;
}

export function ScenarioBuilderPanel({ conversationId, onClose }: ScenarioBuilderPanelProps) {
  const s = usePanelState(conversationId);
  return (
    <div className="flex flex-col h-full bg-white">
      <PanelHeader
        draftCount={s.draftScenarios.length}
        curatedCount={s.scenariosCtx.counts.curated}
        pendingCount={s.pendingTotal}
        onClose={onClose}
      />
      <PanelToolbar
        conversationId={conversationId}
        hasExistingScenarios={s.scenariosCtx.scenarios.length > 0}
        isGenerating={s.generatorCtx.isGenerating}
        generationError={(s.generatorCtx.generationError as Error) ?? null}
        onGenerate={(mode) => void s.generatorCtx.generate({ mode })}
        draftCount={s.draftScenarios.length}
        isCurating={s.scenariosCtx.isCurating}
        onSaveClick={s.handleSaveClick}
        onAdd={(input) => s.scenariosCtx.createScenario(input)}
        isAdding={s.scenariosCtx.isCreating}
      />
      <PanelErrors errors={s.errors} />
      {s.showSaveConfirm && (
        <SaveConfirmBanner
          pendingCount={s.pendingTotal}
          onAcceptAll={() => void s.runCurate('accepted')}
          onRejectAll={() => void s.runCurate('rejected')}
          onCancel={() => s.setShowSaveConfirm(false)}
        />
      )}
      <PanelBody
        isLoading={s.scenariosCtx.isLoading}
        draftScenarios={s.draftScenarios}
        curatedCount={s.scenariosCtx.counts.curated}
        isMutating={s.isMutating}
        onPatchSteps={s.handlePatchSteps}
        onDelete={s.handleDelete}
      />
    </div>
  );
}
