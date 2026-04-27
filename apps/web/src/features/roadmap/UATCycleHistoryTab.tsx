/**
 * UATCycleHistoryTab — chronological view of all per-item UAT decisions across
 * cycles (FR-130 v2.0 / J12, T048). Promotes the per-item PriorCyclesView
 * collapsible into a first-class tab so admins can audit the full review
 * history without expanding each item.
 */

import type { UatPriorCycle, UatReviewItem } from '@/lib/api/uat-review-api';

type Decision = UatPriorCycle['decision'];

interface AggregatedDecision extends UatPriorCycle {
  itemId: string;
  itemText: string;
}

const DECISION_STYLES: Record<Decision, string> = {
  pass: 'bg-green-100 text-green-700',
  fail: 'bg-red-100 text-red-700',
  defer: 'bg-amber-100 text-amber-700',
};

interface Props {
  items: ReadonlyArray<UatReviewItem>;
}

export function aggregateCycleHistory(items: ReadonlyArray<UatReviewItem>): AggregatedDecision[] {
  const all: AggregatedDecision[] = [];
  for (const item of items) {
    for (const cycle of item.prior_cycles ?? []) {
      all.push({ ...cycle, itemId: item.id, itemText: item.criterion_text });
    }
  }
  // Sort newest first by reviewed_at, falling back to cycle_number.
  return all.sort((a, b) => {
    const ta = new Date(a.reviewed_at).getTime();
    const tb = new Date(b.reviewed_at).getTime();
    if (ta !== tb) return tb - ta;
    return b.cycle_number - a.cycle_number;
  });
}

export function UATCycleHistoryTab({ items }: Props) {
  const decisions = aggregateCycleHistory(items);

  if (decisions.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500" data-testid="uat-cycle-history-empty">
        No prior cycles yet. The first review submission will appear here.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2" data-testid="uat-cycle-history">
      {decisions.map((d, idx) => (
        <CycleRow key={`${d.itemId}-${d.cycle_number}-${idx}`} decision={d} />
      ))}
    </div>
  );
}

function CycleRow({ decision }: { decision: AggregatedDecision }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${DECISION_STYLES[decision.decision]}`}>
          Cycle {decision.cycle_number} · {decision.decision}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto">
          {new Date(decision.reviewed_at).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-gray-700 mb-1">{decision.itemText}</p>
      {decision.feedback && (
        <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2 mt-1">
          {decision.feedback}
        </p>
      )}
    </div>
  );
}
