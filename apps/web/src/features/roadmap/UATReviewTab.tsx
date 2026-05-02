/**
 * UATReviewTab — the per-item review surface inside the UAT panel
 * (FR-130 v2.0 / J12, T048). Extracted from UATReviewPanel to keep that file
 * under the 300-line constitution limit when the Cycle history tab was added.
 */

import type { ReactNode } from 'react';
import { UATChecklistItem } from './UATChecklistItem';
import type { useUATPackage } from './useUATPackage';
import type { useSubmitReview } from '@/features/uat/hooks/useUatReview';
import type {
  UatPriorCycle,
  UatPrototypeRef,
  UatSubmitResult,
  BpReviewProjection,
} from '@/lib/api/uat-review-api';

interface UATReviewTabProps {
  uat: ReturnType<typeof useUATPackage>;
  submitReview: ReturnType<typeof useSubmitReview>;
  currentCycle: number;
  priorCyclesByItem: Map<string, UatPriorCycle[]>;
  prototypeByItem: Map<string, UatPrototypeRef>;
  projectionByItem: Map<string, BpReviewProjection>;
  featureId: string;
  onMetadataChange: (
    itemId: string,
    m: { observation_text?: string; evidence_path?: string | null; ai_caption?: string | null }
  ) => void;
  isReviewable: boolean;
  approvalBar: ReactNode;
}

export function UATReviewTab({
  uat,
  currentCycle,
  priorCyclesByItem,
  prototypeByItem,
  projectionByItem,
  featureId,
  onMetadataChange,
  approvalBar,
}: UATReviewTabProps) {
  const pkg = uat.package!;
  return (
    <>
      <ReReviewBanner cycle={currentCycle} />
      <SpecVersionMismatchBanner pkg={pkg} />
      {pkg.scenarios_updated_since_package && <ScenarioDriftBanner />}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <PrototypeRefsHeader refs={pkg.prototype_refs ?? []} />
        {uat.items.map((item) => (
          <UATChecklistItem
            key={item.id}
            item={item}
            priorCycles={priorCyclesByItem.get(item.id) ?? []}
            prototype={prototypeByItem.get(item.id) ?? null}
            projection={projectionByItem.get(item.id) ?? null}
            featureId={featureId}
            onMetadataChange={onMetadataChange}
            onDecision={(itemId, decision, feedback) =>
              uat.updateItem({ itemId, decision, feedback }).catch(() => {})
            }
            isUpdating={uat.isUpdating}
          />
        ))}
      </div>
      {approvalBar}
    </>
  );
}

function ReReviewBanner({ cycle }: { cycle: number }) {
  if (cycle <= 1) return null;
  return (
    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
      Re-review — submitting will record cycle {cycle}. Previous cycle decisions appear under each
      item.
    </div>
  );
}

interface SpecMismatchPkg {
  spec_version_mismatch: boolean;
  spec_version_at_creation: number;
  current_spec_version: number;
}
function SpecVersionMismatchBanner({ pkg }: { pkg: SpecMismatchPkg }) {
  if (!pkg.spec_version_mismatch) return null;
  return (
    <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-2">
      <span>Warning:</span>
      <span>
        Spec updated since package generation (v{pkg.spec_version_at_creation} → v
        {pkg.current_spec_version}).
      </span>
    </div>
  );
}

function PrototypeRefsHeader({ refs }: { refs: { prototype_version_id: string }[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-2">
      <h4 className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-1">
        Prototype References
      </h4>
      <p className="text-xs text-indigo-600">
        {refs.length} prototype(s) linked. Visual references appear alongside criteria.
      </p>
    </div>
  );
}

/** FR-141 J3 — banner shown when curated UAT scenarios were edited after the
 *  current package was generated. The checklist remains the original snapshot;
 *  closing the cycle and regenerating picks up the latest curated state. */
function ScenarioDriftBanner() {
  return (
    <div
      className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-800 flex items-center gap-2"
      role="status"
    >
      <span aria-hidden="true">✨</span>
      <span>
        UAT scenarios were edited after this package was generated. The checklist below is the
        original snapshot. Close this cycle to regenerate from the latest curated scenarios.
      </span>
    </div>
  );
}

// Re-export the result type so the panel uses one source of truth for callbacks.
export type { UatSubmitResult };
