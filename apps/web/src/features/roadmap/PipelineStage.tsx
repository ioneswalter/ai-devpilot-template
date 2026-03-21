/**
 * PipelineStage - Individual stage button with status indicator.
 * Shows icon + label (or icon-only on small screens) with colour-coded status.
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
  deploy: 'Deploy',
};

const STATUS_STYLES = {
  not_started: {
    bg: 'bg-gray-100',
    text: 'text-gray-400',
    border: 'border-gray-200',
    ring: '',
  },
  in_progress: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-200',
    ring: 'ring-2 ring-blue-300 ring-offset-1',
  },
  completed: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    border: 'border-green-200',
    ring: '',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200',
    ring: '',
  },
} as const;

function StageIcon({ stage, statusValue }: { stage: PipelineStageName; statusValue: string }) {
  if (statusValue === 'completed') {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }

  if (statusValue === 'warning') {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    );
  }

  // Default icons per stage
  const icons: Record<PipelineStageName, JSX.Element> = {
    spec: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    build: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    test: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    deploy: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    ),
  };

  return icons[stage];
}

export function PipelineStage({ stage, status, isAdmin, onClick }: PipelineStageProps) {
  const styles = STATUS_STYLES[status.status];
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
        inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium
        transition-all duration-150
        ${styles.bg} ${styles.text} ${styles.border} ${styles.ring}
        ${isClickable ? 'cursor-pointer hover:shadow-sm active:scale-95' : 'cursor-default'}
        disabled:cursor-default
      `}
      title={`${STAGE_LABELS[stage]}: ${status.label}`}
      aria-label={`${STAGE_LABELS[stage]} stage: ${status.label}`}
      aria-disabled={!isClickable}
      tabIndex={isClickable ? 0 : -1}
    >
      <StageIcon stage={stage} statusValue={status.status} />
      <span className="hidden sm:inline">{STAGE_LABELS[stage]}</span>
      <span className="hidden lg:inline text-[10px] opacity-75">
        {status.label !== STAGE_LABELS[stage] ? `· ${status.label}` : ''}
      </span>
    </button>
  );
}
