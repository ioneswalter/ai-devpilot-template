/**
 * CompliancePanel — Constitution compliance breakdown for build review.
 * Shows per-file pass/fail status with expandable violation details.
 * Exposes isBlocked callback for gating build approval (FR-139 J2).
 */

import { useEffect } from 'react';
import { useComplianceReport } from './useComplianceReport';
import { ComplianceSummaryBadge } from './ComplianceSummaryBadge';
import { ComplianceFileRow } from './ComplianceFileRow';
import type { ImplementationTaskItem } from '@/lib/api/feature-api';

interface CompliancePanelProps {
  featureId: string;
  taskItems: ImplementationTaskItem[];
  onBlockedChange?: (blocked: boolean) => void;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-100 rounded w-1/2" />
      <div className="h-3 bg-gray-100 rounded w-2/3" />
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <span className="text-red-500" aria-hidden="true">{'\u26A0'}</span>
      <p className="text-xs text-red-700">
        Compliance check failed: {message}
      </p>
    </div>
  );
}

export function CompliancePanel({
  featureId,
  taskItems,
  onBlockedChange,
}: CompliancePanelProps) {
  const { report, isLoading, isError, error, refetch } = useComplianceReport({
    featureId,
    taskItems,
  });

  const isBlocked = report?.status === 'FAIL';

  useEffect(() => {
    onBlockedChange?.(isBlocked);
  }, [isBlocked, onBlockedChange]);

  const badgeVariant = !report
    ? 'not-scanned'
    : report.status === 'PASS'
      ? 'pass'
      : isBlocked
        ? 'blocked'
        : 'fail';

  const violationFiles = report?.files.filter((f) => f.status !== 'pass') ?? [];

  return (
    <div
      className="border rounded-lg overflow-hidden"
      role="region"
      aria-label="Constitution Compliance"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
        <div className="flex items-center gap-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Constitution Compliance
          </h4>
          <ComplianceSummaryBadge variant={badgeVariant} />
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={isLoading}
          className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Scanning...' : 'Re-scan'}
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {isLoading && <LoadingSkeleton />}

        {isError && error && (
          <ErrorMessage message={error.message} />
        )}

        {!isLoading && !isError && !report && (
          <p className="text-xs text-gray-400 text-center py-2">
            No generated code to scan. Accept tasks and run implementation first.
          </p>
        )}

        {!isLoading && report && (
          <>
            <SummaryStats report={report} />
            <div className="space-y-2" role="list" aria-label="File compliance results">
              {violationFiles.map((file) => (
                <ComplianceFileRow key={file.path} file={file} />
              ))}
              {report.compliant_files > 0 && violationFiles.length > 0 && (
                <p className="text-xs text-green-600 pl-1">
                  + {report.compliant_files} compliant file{report.compliant_files > 1 ? 's' : ''}
                </p>
              )}
              {violationFiles.length === 0 && (
                <p className="text-xs text-green-600 text-center py-1">
                  All {report.total_files} files pass constitution checks.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStats({ report }: { report: NonNullable<ReturnType<typeof useComplianceReport>['report']> }) {
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-gray-500">
        {report.total_files} file{report.total_files !== 1 ? 's' : ''} scanned
      </span>
      <span className="text-green-600">
        {report.compliant_files} compliant
      </span>
      {report.total_violations > 0 && (
        <span className="text-red-600 font-medium">
          {report.total_violations} violation{report.total_violations !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
