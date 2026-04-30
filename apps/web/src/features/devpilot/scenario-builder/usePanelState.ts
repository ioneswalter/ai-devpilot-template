/**
 * FR-141 — Derived state + mutation orchestration for the Scenario Builder panel.
 * Extracted from ScenarioBuilderPanel.tsx so the orchestrator stays under the
 * 50-line function-size limit.
 */

import { useMemo, useState } from 'react';
import type { UATScenario, ScenarioStep } from '@ownyourgig/types';
import { useScenarios } from './useUatScenarios';
import { useUatScenarioGenerator } from './useUatScenarioGenerator';

export function usePanelState(conversationId: string) {
  const scenariosCtx = useScenarios(conversationId);
  const generatorCtx = useUatScenarioGenerator(conversationId);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const draftScenarios: UATScenario[] = useMemo(
    () => scenariosCtx.scenarios.filter((s) => s.review_status === 'draft'),
    [scenariosCtx.scenarios]
  );
  const pendingTotal = useMemo(() => countPending(draftScenarios), [draftScenarios]);
  const isMutating =
    generatorCtx.isGenerating ||
    scenariosCtx.isPatching ||
    scenariosCtx.isCurating ||
    scenariosCtx.isDeleting ||
    scenariosCtx.isCreating;

  const errors = collectErrors(scenariosCtx, generatorCtx);

  const handlePatchSteps = (scenario: UATScenario, steps: ScenarioStep[]) =>
    scenariosCtx.patchScenario({ id: scenario.id, input: { steps } });
  const handleDelete = (scenario: UATScenario) => scenariosCtx.deleteScenario(scenario.id);
  const runCurate = (promote: 'accepted' | 'rejected') => {
    setShowSaveConfirm(false);
    return curateAll(draftScenarios, promote, scenariosCtx.curateScenario);
  };
  const handleSaveClick = () => {
    if (draftScenarios.length === 0) return;
    if (pendingTotal > 0) setShowSaveConfirm(true);
    else void runCurate('accepted');
  };

  return {
    scenariosCtx,
    generatorCtx,
    draftScenarios,
    pendingTotal,
    isMutating,
    errors,
    showSaveConfirm,
    setShowSaveConfirm,
    handlePatchSteps,
    handleDelete,
    runCurate,
    handleSaveClick,
  };
}

function countPending(scenarios: UATScenario[]): number {
  let n = 0;
  for (const s of scenarios) {
    for (const step of s.steps) if (step.decision === 'pending') n++;
  }
  return n;
}

type CurateFn = (input: {
  id: string;
  input?: { promote_pending_to: 'accepted' | 'rejected' };
}) => Promise<unknown>;

async function curateAll(
  drafts: UATScenario[],
  promote: 'accepted' | 'rejected',
  curate: CurateFn
): Promise<void> {
  for (const s of drafts) {
    try {
      await curate({ id: s.id, input: { promote_pending_to: promote } });
    } catch (e) {
      console.error('curate failed for', s.id, e);
    }
  }
}

interface ErrorBag {
  listError: unknown;
  createError: unknown;
  patchError: unknown;
  curateError: unknown;
  deleteError: unknown;
}
interface GenBag {
  generationError: unknown;
}

function collectErrors(s: ErrorBag, g: GenBag): Error[] {
  return [s.listError, g.generationError, s.createError, s.patchError, s.curateError, s.deleteError]
    .filter((e): e is Error => e instanceof Error);
}
