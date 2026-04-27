/**
 * PipelineStage - Individual stage with two-icon system:
 *   ○ (gray circle) = not started / not done
 *   ✓ (green check) = completed / done
 * Warning stages use amber checkmark. In-progress uses blue circle.
 */

import type { StageStatus, PipelineStageName } from './pipeline-types';

interface PipelineStageProps {
  stage: PipelineStageName;
  status: StageStatus;
  isAdmin: boolean;
  onClick?: () => void;
}

const STAGE_LABELS: Record<PipelineStageName, string> = {
  spec: 'Spec',
  build: 'Build',
  test: 'Test',
  uat: 'UAT', // PipelineStage is rarely used for uat — UatPipelineTile handles that path; this keeps the type Record exhaustive.
  deploy: 'Deploy',
};

const STATUS_STYLES = {
  not_started: {
    bg: 'bg-gray-100',
    text: 'text-gray-400',
    border: 'border-gray-200',
  },
  in_progress: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-200',
  },
  completed: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    border: 'border-green-200',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
  },
  escalated: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-300',
  },
} as const;

/** Circle icon — not started */
function CircleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  );
}

/** Checkmark icon — completed */
function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function PipelineStage({ stage, status, isAdmin, onClick }: PipelineStageProps) {
  const safeStatus = status ?? { status: 'not_started' as const, label: 'Not Started' };
  const isDone = safeStatus.status === 'completed' || safeStatus.status === 'warning';
  const styles = STATUS_STYLES[safeStatus.status] ?? STATUS_STYLES.not_started;
  const isClickable = isAdmin && !!onClick;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (isClickable) onClick();
      }}
      disabled={!isClickable}
      className={`
        inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md border text-[11px] sm:text-xs font-medium
        transition-all duration-150 shrink-0
        ${styles.bg} ${styles.text} ${styles.border}
        ${isClickable ? 'cursor-pointer hover:shadow-sm active:scale-95' : 'cursor-default'}
        disabled:cursor-default
      `}
      title={`${STAGE_LABELS[stage]}: ${safeStatus.label}`}
      aria-label={`${STAGE_LABELS[stage]} stage: ${safeStatus.label}`}
      aria-disabled={!isClickable}
      tabIndex={isClickable ? 0 : -1}
    >
      {isDone ? <CheckIcon /> : <CircleIcon />}
      <span>{STAGE_LABELS[stage]}</span>
      {safeStatus.label !== 'Not Started' && safeStatus.label !== STAGE_LABELS[stage] && (
        <span className="hidden lg:inline text-[10px] opacity-75">· {safeStatus.label}</span>
      )}
    </button>
  );
}
