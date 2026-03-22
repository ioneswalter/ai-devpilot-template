/**
 * PipelineBar - Compact inline pipeline showing Spec | Build | Test | Deploy
 * with colour-coded status. Clickable stages for admin users.
 */

import type { FeaturePipelineState, PipelineStageName, StageStatusValue } from './pipeline-types';
import { PIPELINE_VISIBLE_STATUSES } from './pipeline-types';

interface PipelineBarProps {
  featureStatus: string;
  pipeline: FeaturePipelineState | undefined;
  isAdmin: boolean;
  onStageClick?: (stage: PipelineStageName) => void;
}

const STAGE_ORDER: PipelineStageName[] = ['spec', 'build', 'test', 'deploy'];

const STAGE_LABELS: Record<PipelineStageName, string> = {
  spec: 'Spec',
  build: 'Build',
  test: 'Test',
  deploy: 'Deploy',
};

const STATUS_COLORS: Record<StageStatusValue, string> = {
  not_started: 'text-gray-400',
  in_progress: 'text-blue-600 font-semibold',
  completed: 'text-green-600',
  warning: 'text-amber-600',
};

export function PipelineBar({ featureStatus, pipeline, isAdmin, onStageClick }: PipelineBarProps) {
  if (!PIPELINE_VISIBLE_STATUSES.includes(featureStatus as typeof PIPELINE_VISIBLE_STATUSES[number])) {
    return null;
  }

  if (!pipeline) {
    return (
      <div className="flex items-center gap-1 py-1.5 text-xs text-gray-300 animate-pulse">
        Spec &middot; Build &middot; Test &middot; Deploy
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 py-1.5 text-xs" role="toolbar" aria-label="Development pipeline">
      {STAGE_ORDER.map((stage, idx) => {
        const stageData = pipeline[stage] ?? { status: 'not_started' as const, label: 'Not Started' };
        const colorClass = STATUS_COLORS[stageData.status];
        const isClickable = isAdmin && !!onStageClick;

        return (
          <span key={stage} className="flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isClickable) onStageClick!(stage);
              }}
              disabled={!isClickable}
              className={`${colorClass} ${isClickable ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
              title={`${STAGE_LABELS[stage]}: ${stageData.label}`}
            >
              {stageData.status === 'completed' && (
                <svg className="w-3 h-3 inline mr-0.5 -mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {stageData.status === 'warning' && (
                <svg className="w-3 h-3 inline mr-0.5 -mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                </svg>
              )}
              {STAGE_LABELS[stage]}
            </button>
            {idx < STAGE_ORDER.length - 1 && (
              <span className="text-gray-300 mx-1">|</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
