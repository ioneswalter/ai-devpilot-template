/**
 * FR-141 — Body of the Scenario Builder panel: empty state, draft sections (Happy Paths,
 * Edge Cases), and a curated-summary line at the bottom. Storyboards delegate to
 * ScenarioStoryboard for per-scenario rendering.
 */

import type { UATScenario, ScenarioStep } from '@ownyourgig/types';
import { ScenarioStoryboard } from './ScenarioStoryboard';

interface PanelBodyProps {
  isLoading: boolean;
  draftScenarios: UATScenario[];
  curatedCount: number;
  isMutating: boolean;
  onPatchSteps: (scenario: UATScenario, steps: ScenarioStep[]) => Promise<unknown> | void;
  onDelete: (scenario: UATScenario) => Promise<unknown> | void;
}

export function PanelBody(props: PanelBodyProps) {
  const happyPaths = props.draftScenarios.filter((s) => s.scenario_type === 'happy_path');
  const edgeCases = props.draftScenarios.filter((s) => s.scenario_type === 'edge_case');
  const isEmpty = !props.isLoading && props.draftScenarios.length === 0 && props.curatedCount === 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      {props.isLoading && (
        <div className="flex items-center justify-center text-sm text-gray-400 py-8">
          Loading scenarios…
        </div>
      )}
      {isEmpty && <EmptyState />}

      {happyPaths.length > 0 && (
        <Section title="Happy Paths" tone="emerald">
          {happyPaths.map((s) => (
            <ScenarioStoryboard
              key={s.id}
              scenario={s}
              isSaving={props.isMutating}
              onPatchSteps={(steps) => props.onPatchSteps(s, steps)}
              onDelete={() => props.onDelete(s)}
            />
          ))}
        </Section>
      )}

      {edgeCases.length > 0 && (
        <Section title="Edge Cases" tone="amber">
          {edgeCases.map((s) => (
            <ScenarioStoryboard
              key={s.id}
              scenario={s}
              isSaving={props.isMutating}
              onPatchSteps={(steps) => props.onPatchSteps(s, steps)}
              onDelete={() => props.onDelete(s)}
            />
          ))}
        </Section>
      )}

      {props.curatedCount > 0 && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {props.curatedCount} curated scenario{props.curatedCount === 1 ? '' : 's'} already saved
          on this conversation. Submitting the proposal will link them to the new feature.
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center text-sm text-gray-500 py-12 max-w-md mx-auto">
      <p className="font-medium text-gray-700 mb-2">No scenarios yet</p>
      <p>
        Click <span className="font-semibold">Generate UAT scenarios</span> to have the AI draft
        happy paths and edge cases from this conversation. You will then accept, edit, or reject
        each step.
      </p>
    </div>
  );
}

interface SectionProps {
  title: string;
  tone: 'emerald' | 'amber';
  children: React.ReactNode;
}

function Section({ title, tone, children }: SectionProps) {
  const dot = tone === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
