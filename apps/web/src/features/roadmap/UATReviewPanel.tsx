/**
 * UATReviewPanel — Main UAT review interface for Business Partners (FR-129)
 * Shows package header, spec version warning, checklist items, and approval bar.
 */

import { useState } from 'react';
import { useUATPackage } from './useUATPackage';
import { UATChecklistItem } from './UATChecklistItem';

interface UATReviewPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
}

export function UATReviewPanel({
  featureId, featureCode, featureTitle, featureStatus, onClose,
}: UATReviewPanelProps) {
  const uat = useUATPackage(featureId);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);

  if (uat.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading UAT package...</p>
      </div>
    );
  }

  if (uat.error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 mb-2">Failed to load UAT package</p>
        <p className="text-xs text-gray-500">{(uat.error as Error).message}</p>
        <button onClick={onClose} className="mt-4 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    );
  }

  if (!uat.package) {
    return <NoPackageView featureCode={featureCode} featureTitle={featureTitle} featureStatus={featureStatus}
      isGenerating={uat.isGenerating} generateError={uat.generateError}
      onGenerate={() => uat.generate().catch(() => {})} onClose={onClose} />;
  }

  if (showSuccess) {
    return <UATSuccessView result={showSuccess} featureCode={featureCode} counts={uat} />;
  }

  return <UATPackageView uat={uat} featureCode={featureCode} featureTitle={featureTitle}
    onClose={onClose} onSuccess={setShowSuccess} />;
}

function UATSuccessView({ result, featureCode, counts }: { result: string; featureCode: string; counts: { passedCount: number; failedCount: number; deferredCount: number } }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${result === 'approved' ? 'bg-green-100' : 'bg-red-100'}`}>
        <span className="text-2xl">{result === 'approved' ? '✓' : '✗'}</span>
      </div>
      <h4 className="text-base font-semibold text-gray-900">{result === 'approved' ? 'UAT Approved' : 'UAT Rejected'}</h4>
      <p className="text-sm text-gray-500">{featureCode} — {counts.passedCount} passed, {counts.failedCount} failed, {counts.deferredCount} deferred</p>
    </div>
  );
}

function UATPackageView({ uat, featureCode, featureTitle, onClose, onSuccess }: {
  uat: ReturnType<typeof useUATPackage>; featureCode: string; featureTitle: string;
  onClose: () => void; onSuccess: (s: string) => void;
}) {
  const pkg = uat.package!;
  const isReviewable = pkg.status === 'in_review';
  return (
    <div className="flex flex-col h-full">
      <UATHeader featureCode={featureCode} featureTitle={featureTitle} pkg={pkg} />
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
            onDecision={(itemId, decision, feedback) => uat.updateItem({ itemId, decision, feedback }).catch(() => {})}
            isUpdating={uat.isUpdating} />
        ))}
      </div>
      <UATApprovalBar uat={uat} isReviewable={isReviewable} onClose={onClose} onSuccess={onSuccess} />
    </div>
  );
}

function UATHeader({ featureCode, featureTitle, pkg }: { featureCode: string; featureTitle: string; pkg: NonNullable<ReturnType<typeof useUATPackage>['package']> }) {
  return (
    <div className="p-4 border-b bg-white">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-xs font-mono text-teal-600">{featureCode}</code>
        <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${pkg.status === 'approved' ? 'bg-green-100 text-green-700' : pkg.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>
          UAT {pkg.status.replace('_', ' ')}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>Generated: {new Date(pkg.created_at).toLocaleDateString()}</span>
        <span>Tests: {pkg.test_summary.passed}/{pkg.test_summary.total} passed</span>
        <span>{pkg.generated_by === 'auto' ? 'Auto-generated' : 'Manual'}</span>
      </div>
    </div>
  );
}

function UATApprovalBar({ uat, isReviewable, onClose, onSuccess }: {
  uat: ReturnType<typeof useUATPackage>; isReviewable: boolean; onClose: () => void; onSuccess: (s: string) => void;
}) {
  return (
    <div className="border-t p-3 bg-white flex items-center justify-between">
      <div className="text-xs text-gray-500 space-x-3">
        <span>{uat.pendingCount} pending</span>
        <span className="text-green-600">{uat.passedCount} passed</span>
        {uat.failedCount > 0 && <span className="text-red-600">{uat.failedCount} failed</span>}
        {uat.deferredCount > 0 && <span className="text-amber-600">{uat.deferredCount} deferred</span>}
      </div>
      <div className="flex items-center gap-2">
        {isReviewable && uat.pendingCount === 0 && (
          <>
            <button onClick={() => uat.approve({ action: 'reject' }).then(() => onSuccess('rejected')).catch(() => {})}
              disabled={uat.isApproving} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">Reject</button>
            <button onClick={() => uat.approve({ action: 'approve' }).then(() => onSuccess('approved')).catch(() => {})}
              disabled={uat.isApproving} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {uat.isApproving ? 'Approving...' : 'Approve UAT'}
            </button>
          </>
        )}
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Close</button>
      </div>
      {uat.approveError && <div className="px-4 py-2 bg-red-50 text-xs text-red-600">{(uat.approveError as Error).message}</div>}
    </div>
  );
}

/** Shown when no UAT package exists yet */
function NoPackageView({ featureCode, featureTitle, featureStatus, isGenerating, generateError, onGenerate, onClose }: {
  featureCode: string; featureTitle: string; featureStatus: string;
  isGenerating: boolean; generateError: Error | null;
  onGenerate: () => void; onClose: () => void;
}) {
  const canGenerate = featureStatus === 'in_testing' || featureStatus === 'released';

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-teal-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">No UAT package has been generated yet.</p>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-sm text-gray-500 mb-4">
            {canGenerate
              ? 'Generate a UAT package to create an acceptance criteria checklist for Business Partner review.'
              : 'UAT packages can only be generated for features in testing (all tests must pass).'}
          </p>
          {canGenerate && (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'Generate UAT Package'}
            </button>
          )}
          {generateError && (
            <p className="mt-2 text-xs text-red-600">{generateError.message}</p>
          )}
        </div>
      </div>
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    </div>
  );
}
