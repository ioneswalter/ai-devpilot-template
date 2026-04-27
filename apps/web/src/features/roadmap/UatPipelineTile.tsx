/**
 * UatPipelineTile — UAT pipeline tile (FR-130 v2.0 / J10).
 *
 * Renders the Acceptance stage tile in the PipelineBar between Test and Deploy.
 * Shows: state (not_started | in_review | approved | rejected), cycle indicator
 * when cycleNumber > 1, an SLA-overdue badge when due_at has passed, and a
 * compact pass/fail/defer/pending coverage bar (T042).
 *
 * Role-guarded: only BP, SE, or Admin (computed via useUserRoles + role-panel-map)
 * can click the tile — non-permitted users see the tile but it's read-only.
 */

import { useState } from 'react';
import { UatAuditLogModal } from './UatAuditLogModal';
import type { UatStageDetail } from './pipeline-types';

interface UatPipelineTileProps {
  status: UatStageDetail;
  isAdmin: boolean;
  onClick?: () => void;
  /** FR-130 v2.0 / J12 (T049): admin right-click opens UatAuditLogModal. */
  featureId?: string;
  featureCode?: string;
}

const STATE_STYLES = {
  not_started: { bg: 'bg-gray-100', text: 'text-gray-400', border: 'border-gray-200' },
  in_progress: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  escalated: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
} as const;

function CircleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CoverageBar({ counts }: { counts: UatStageDetail['decisionCounts'] }) {
  const total = counts.pass + counts.fail + counts.defer + counts.pending;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <span
      className="inline-flex h-1 w-10 rounded overflow-hidden bg-gray-200"
      title={`pass ${counts.pass} · fail ${counts.fail} · defer ${counts.defer} · pending ${counts.pending}`}
      data-testid="uat-coverage-bar"
    >
      {counts.pass > 0 && <span className="bg-green-500" style={{ width: pct(counts.pass) }} />}
      {counts.fail > 0 && <span className="bg-red-500" style={{ width: pct(counts.fail) }} />}
      {counts.defer > 0 && <span className="bg-amber-500" style={{ width: pct(counts.defer) }} />}
    </span>
  );
}

function TileButton({ status, isClickable, overdue, canShowAudit, onClick, onContextMenu }: {
  status: UatStageDetail;
  isClickable: boolean;
  overdue: boolean;
  canShowAudit: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const styles = STATE_STYLES[status.status as keyof typeof STATE_STYLES] ?? STATE_STYLES.not_started;
  const isDone = status.status === 'completed';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (isClickable) onClick(); }}
      onContextMenu={onContextMenu}
      disabled={!isClickable}
      className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-md border text-[11px] sm:text-xs font-medium transition-all duration-150 shrink-0 ${styles.bg} ${styles.text} ${styles.border} ${isClickable ? 'cursor-pointer hover:shadow-sm active:scale-95' : 'cursor-default'} disabled:cursor-default`}
      title={`UAT: ${status.label}${overdue ? ' (SLA overdue)' : ''}${canShowAudit ? ' · right-click for audit log' : ''}`}
      aria-label={`UAT stage: ${status.label}${overdue ? ', SLA overdue' : ''}`}
      aria-disabled={!isClickable}
      tabIndex={isClickable ? 0 : -1}
      data-testid="uat-pipeline-tile"
    >
      {isDone ? <CheckIcon /> : <CircleIcon />}
      <span>UAT</span>
      {status.cycleNumber > 1 && (
        <span className="hidden lg:inline text-[10px] opacity-75">· Cycle {status.cycleNumber}</span>
      )}
      <CoverageBar counts={status.decisionCounts} />
      {overdue && (
        <span
          className="ml-0.5 px-1 py-px rounded text-[9px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-300"
          title={`SLA overdue (due ${status.dueAt ? new Date(status.dueAt).toLocaleDateString() : 'unknown'})`}
          data-testid="uat-sla-overdue"
        >
          SLA
        </span>
      )}
    </button>
  );
}

const DEFAULT_STATUS: UatStageDetail = {
  status: 'not_started', label: 'Not Started',
  packageStatus: null, cycleNumber: 0, decisionCounts: { pass: 0, fail: 0, defer: 0, pending: 0 }, dueAt: null,
};

export function UatPipelineTile({ status, isAdmin, onClick, featureId, featureCode }: UatPipelineTileProps) {
  const safeStatus = status ?? DEFAULT_STATUS;
  const isClickable = isAdmin && !!onClick;
  const overdue = safeStatus.packageStatus === 'in_review' && safeStatus.dueAt !== null
    && new Date(safeStatus.dueAt).getTime() < Date.now();
  const [auditOpen, setAuditOpen] = useState(false);
  const canShowAudit = isAdmin && !!featureId && !!featureCode;

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canShowAudit) return;
    e.preventDefault();
    e.stopPropagation();
    setAuditOpen(true);
  };

  return (
    <>
      <TileButton
        status={safeStatus}
        isClickable={isClickable}
        overdue={overdue}
        canShowAudit={canShowAudit}
        onClick={onClick ?? (() => {})}
        onContextMenu={handleContextMenu}
      />
      {auditOpen && featureId && featureCode && (
        <UatAuditLogModal featureId={featureId} featureCode={featureCode} onClose={() => setAuditOpen(false)} />
      )}
    </>
  );
}
