/**
 * PipelineBar - Horizontal bar showing four pipeline stages (Spec, Build, Test, Deploy).
 * Displays below each feature on the Roadmap page. Shows computed status from existing data.
 */

import { PipelineStage } from './PipelineStage';
import type { FeaturePipelineState, PipelineStageName } from './pipeline-types';
import { PIPELINE_VISIBLE_STATUSES } from './pipeline-types';

interface PipelineBarProps {
  featureStatus: string;
  pipeline: FeaturePipelineState | undefined;
  isAdmin: boolean;
  isLoading?: boolean;
  onStageClick?: (stage: PipelineStageName) => void;
  /** FR-135: Filter visible stages by role. If omitted, all stages shown. */
  canAccessPanel?: (stage: PipelineStageName) => boolean;
}

const STAGE_ORDER: PipelineStageName[] = ['spec', 'build', 'test', 'deploy'];

const DEFAULT_STAGE = { status: 'not_started' as const, label: 'Not Started' };

export function PipelineBar({ featureStatus, pipeline, isAdmin, isLoading, onStageClick, canAccessPanel }: PipelineBarProps) {
  // Only show for specified, in_development, released features
  if (!PIPELINE_VISIBLE_STATUSES.includes(featureStatus as typeof PIPELINE_VISIBLE_STATUSES[number])) {
    return null;
  }

  // If explicitly loading (caller passes isLoading=true), show skeleton
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 py-1.5" aria-label="Pipeline status loading">
        {STAGE_ORDER.map((stage) => (
          <div
            key={stage}
            className="h-7 w-16 sm:w-20 bg-gray-100 rounded-md animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Use pipeline data if available, or default stages
  const stages = pipeline ?? {
    spec: DEFAULT_STAGE,
    build: DEFAULT_STAGE,
    test: DEFAULT_STAGE,
    deploy: DEFAULT_STAGE,
  } as FeaturePipelineState;

  return (
    <div
      className="flex items-center gap-1 sm:gap-1.5 py-1.5 overflow-x-auto"
      role="toolbar"
      aria-label="Development pipeline"
    >
      {STAGE_ORDER.filter((stage) => !canAccessPanel || canAccessPanel(stage)).map((stage, idx, filtered) => (
        <div key={stage} className="flex items-center">
          <PipelineStage
            stage={stage}
            status={stages[stage] ?? DEFAULT_STAGE}
            isAdmin={isAdmin}
            onClick={onStageClick ? () => onStageClick(stage) : undefined}
          />
          {idx < filtered.length - 1 && (
            <svg className="w-3 h-3 text-gray-300 mx-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
