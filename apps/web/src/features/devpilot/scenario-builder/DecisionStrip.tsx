/**
 * FR-141 — Decision strip rendered under each step card.
 * Accept / Edit / Reject controls; visible-state and ARIA-labelled.
 */

import type { StepDecision } from '@ownyourgig/types';

interface DecisionStripProps {
  decision: StepDecision;
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
  disabled?: boolean;
}

const BTN = 'px-3 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50';
const VARIANT: Record<'accept' | 'edit' | 'reject', { active: string; idle: string }> = {
  accept: {
    active: 'bg-emerald-600 text-white',
    idle: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  edit: { active: 'bg-blue-600 text-white', idle: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  reject: { active: 'bg-rose-600 text-white', idle: 'bg-rose-50 text-rose-700 hover:bg-rose-100' },
};

interface PillProps {
  label: string;
  variant: 'accept' | 'edit' | 'reject';
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}

function Pill({ label, variant, active, disabled, onClick, ariaLabel }: PillProps) {
  const v = VARIANT[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`${BTN} ${active ? v.active : v.idle}`}
    >
      {label}
    </button>
  );
}

export function DecisionStrip({
  decision,
  onAccept,
  onEdit,
  onReject,
  disabled,
}: DecisionStripProps) {
  return (
    <div className="flex items-center gap-1.5 mt-2" role="group" aria-label="Step decision">
      <Pill
        label="Accept"
        variant="accept"
        active={decision === 'accepted'}
        disabled={disabled}
        onClick={onAccept}
        ariaLabel="Accept this step"
      />
      <Pill
        label="Edit"
        variant="edit"
        active={decision === 'edited'}
        disabled={disabled}
        onClick={onEdit}
        ariaLabel="Edit this step"
      />
      <Pill
        label="Reject"
        variant="reject"
        active={decision === 'rejected'}
        disabled={disabled}
        onClick={onReject}
        ariaLabel="Reject this step"
      />
      {decision === 'pending' && (
        <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-400">Pending</span>
      )}
      {decision === 'edited' && (
        <span className="ml-1 text-[10px] uppercase tracking-wide text-blue-600">
          Edited from AI
        </span>
      )}
    </div>
  );
}
