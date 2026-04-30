/**
 * FR-141 — Header for a single scenario in the storyboard.
 * Shows type badge, title, edge-case context (trigger + expected behaviour),
 * decision counts, and Delete-with-confirm.
 */

import { useState } from 'react';
import type { UATScenario } from '@ownyourgig/types';

interface StoryboardHeaderProps {
  scenario: UATScenario;
  counts: { accepted: number; edited: number; rejected: number; pending: number };
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDelete: () => Promise<unknown> | void;
  isSaving?: boolean;
}

export function StoryboardHeader(props: StoryboardHeaderProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <header className="flex items-start justify-between p-3 border-b border-gray-100">
      <HeaderText scenario={props.scenario} counts={props.counts} />
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <button type="button" onClick={props.onToggleCollapse} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200" aria-expanded={!props.collapsed}>
          {props.collapsed ? 'Expand' : 'Collapse'}
        </button>
        {confirmDelete ? (
          <DeleteConfirmRow onConfirm={props.onDelete} onCancel={() => setConfirmDelete(false)} disabled={props.isSaving} />
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100" aria-label="Delete scenario">
            Delete
          </button>
        )}
      </div>
    </header>
  );
}

interface HeaderTextProps {
  scenario: UATScenario;
  counts: { accepted: number; edited: number; rejected: number; pending: number };
}

function HeaderText({ scenario, counts }: HeaderTextProps) {
  const isHappy = scenario.scenario_type === 'happy_path';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${isHappy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {isHappy ? 'Happy Path' : 'Edge Case'}
        </span>
        <h3 className="text-sm font-semibold text-gray-900 truncate">{scenario.title}</h3>
      </div>
      {!isHappy && scenario.trigger_condition && (
        <p className="mt-1 text-xs text-amber-700"><span className="font-medium">Trigger:</span> {scenario.trigger_condition}</p>
      )}
      {!isHappy && scenario.expected_behavior && (
        <p className="mt-0.5 text-xs text-amber-700"><span className="font-medium">Expected behaviour:</span> {scenario.expected_behavior}</p>
      )}
      <div className="mt-1 flex gap-2 text-[11px] text-gray-500">
        <span>{scenario.steps.length} steps</span>
        <span className="text-emerald-600">✓ {counts.accepted}</span>
        <span className="text-blue-600">✎ {counts.edited}</span>
        <span className="text-rose-600">✕ {counts.rejected}</span>
        {counts.pending > 0 && <span>· {counts.pending} pending</span>}
      </div>
    </div>
  );
}

interface DeleteConfirmRowProps {
  onConfirm: () => Promise<unknown> | void;
  onCancel: () => void;
  disabled?: boolean;
}

function DeleteConfirmRow({ onConfirm, onCancel, disabled }: DeleteConfirmRowProps) {
  return (
    <>
      <button type="button" onClick={() => void onConfirm()} disabled={disabled} className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50" aria-label="Confirm delete scenario">Confirm delete</button>
      <button type="button" onClick={onCancel} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
    </>
  );
}
