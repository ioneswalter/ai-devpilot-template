/**
 * PipelineBar - Horizontal bar showing four pipeline stages (Spec, Build, Test, Deploy).
 * Displays below each feature on the Roadmap page. Shows computed status from existing data.
 */

import { PipelineStage } from './PipelineStage';
import { UatPipelineTile } from './UatPipelineTile';
import type { FeaturePipelineState, PipelineStageName, UatStageDetail } from './pipeline-types';
import { PIPELINE_VISIBLE_STATUSES } from './pipeline-types';

interface PipelineBarProps {
  featureStatus: string;
  pipeline: FeaturePipelineState | undefined;
  isAdmin: boolean;
  isLoading?: boolean;
  onStageClick?: (stage: PipelineStageName) => void;
  /** FR-135: Filter visible stages by role. If omitted, all stages shown. */
  canAccessPanel?: (stage: PipelineStageName) => boolean;
  /** FR-130 v2.0 / J12 (T049): forwarded to UatPipelineTile for right-click audit log access. */
  featureId?: string;
  featureCode?: string;
}

// FR-130 v2.0 / J10: 'uat' inserted between 'test' and 'deploy'.
const STAGE_ORDER: PipelineStageName[] = ['spec', 'build', 'test', 'uat', 'deploy'];

const DEFAULT_STAGE = { status: 'not_started' as const, label: 'Not Started' };
const DEFAULT_UAT: UatStageDetail = {
  status: 'not_started', label: 'Not Started',
  packageStatus: null, cycleNumber: 0,
  decisionCounts: { pass: 0, fail: 0, defer: 0, pending: 0 }, dueAt: null,
};

function StageSkeleton() {
  return (
    <div className="flex items-center gap-1.5 py-1.5" aria-label="Pipeline status loading">
      {STAGE_ORDER.map((stage) => (
        <div key={stage} className="h-7 w-16 sm:w-20 bg-gray-100 rounded-md animate-pulse" />
      ))}
    </div>
  );
}

function ChevronSep() {
  return (
    <svg
      className="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-testid="pipeline-chevron"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function StageOrTile({ stage, stages, isAdmin, onStageClick, featureId, featureCode }: {
  stage: PipelineStageName;
  stages: FeaturePipelineState;
  isAdmin: boolean;
  onStageClick?: (s: PipelineStageName) => void;
  featureId?: string;
  featureCode?: string;
}) {
  if (stage === 'uat') {
    return (
      <UatPipelineTile
        status={(stages.uat ?? DEFAULT_UAT) as UatStageDetail}
        isAdmin={isAdmin}
        onClick={onStageClick ? () => onStageClick('uat') : undefined}
        featureId={featureId}
        featureCode={featureCode}
      />
    );
  }
  return (
    <PipelineStage
      stage={stage}
      status={stages[stage] ?? DEFAULT_STAGE}
      isAdmin={isAdmin}
      onClick={onStageClick ? () => onStageClick(stage) : undefined}
    />
  );
}

export function PipelineBar({ featureStatus, pipeline, isAdmin, isLoading, onStageClick, canAccessPanel, featureId, featureCode }: PipelineBarProps) {
  if (!PIPELINE_VISIBLE_STATUSES.includes(featureStatus as typeof PIPELINE_VISIBLE_STATUSES[number])) return null;
  if (isLoading) return <StageSkeleton />;

  const stages = pipeline ?? {
    spec: DEFAULT_STAGE, build: DEFAULT_STAGE, test: DEFAULT_STAGE, uat: DEFAULT_UAT, deploy: DEFAULT_STAGE,
  } as FeaturePipelineState;
  const visible = STAGE_ORDER.filter((s) => !canAccessPanel || canAccessPanel(s));

  return (
    <div className="flex items-center gap-2 py-1.5 overflow-x-auto" role="toolbar" aria-label="Development pipeline">
      {visible.flatMap((stage, idx) => {
        const tile = (
          <StageOrTile
            key={`${stage}-tile`}
            stage={stage} stages={stages} isAdmin={isAdmin}
            onStageClick={onStageClick} featureId={featureId} featureCode={featureCode}
          />
        );
        if (idx === visible.length - 1) return [tile];
        return [tile, <ChevronSep key={`${stage}-chev`} />];
      })}
    </div>
  );
}
