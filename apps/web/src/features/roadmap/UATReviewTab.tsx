/**
 * UATReviewTab — the per-item review surface inside the UAT panel
 * (FR-130 v2.0 / J12, T048). Extracted from UATReviewPanel to keep that file
 * under the 300-line constitution limit when the Cycle history tab was added.
 */

import type { ReactNode } from 'react';
import { UATChecklistItem } from './UATChecklistItem';
import type { useUATPackage } from './useUATPackage';
import type { useSubmitReview } from '@/features/uat/hooks/useUatReview';
import type { UatPriorCycle, UatPrototypeRef, UatSubmitResult } from '@/lib/api/uat-review-api';

interface UATReviewTabProps {
  uat: ReturnType<typeof useUATPackage>;
  submitReview: ReturnType<typeof useSubmitReview>;
  currentCycle: number;
  priorCyclesByItem: Map<string, UatPriorCycle[]>;
  prototypeByItem: Map<string, UatPrototypeRef>;
  isReviewable: boolean;
  approvalBar: ReactNode;
}

export function UATReviewTab({ uat, currentCycle, priorCyclesByItem, prototypeByItem, approvalBar }: UATReviewTabProps) {
  const pkg = uat.package!;
  return (
    <>
      {currentCycle > 1 && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
          Re-review — submitting will record cycle {currentCycle}. Previous cycle decisions appear under each item.
        </div>
      )}
      {pkg.spec_version_mismatch && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-2">
          <span>Warning:</span><span>Spec updated since package generation (v{pkg.spec_version_at_creation} → v{pkg.current_spec_version}).</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {pkg.prototype_refs?.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-2">
            <h4 className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-1">Prototype References</h4>
            <p className="text-xs text-indigo-600">{pkg.prototype_refs.length} prototype(s) linked. Visual references appear alongside criteria.</p>
          </div>
        )}
        {uat.items.map((item) => (
          <UATChecklistItem key={item.id} item={item}
            priorCycles={priorCyclesByItem.get(item.id) ?? []}
            prototype={prototypeByItem.get(item.id) ?? null}
            onDecision={(itemId, decision, feedback) => uat.updateItem({ itemId, decision, feedback }).catch(() => {})}
            isUpdating={uat.isUpdating} />
        ))}
      </div>
      {approvalBar}
    </>
  );
}

// Re-export the result type so the panel uses one source of truth for callbacks.
export type { UatSubmitResult };
