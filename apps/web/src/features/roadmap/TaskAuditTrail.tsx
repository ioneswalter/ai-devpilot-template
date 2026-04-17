/**
 * TaskAuditTrail - Displays fix audit records for an implementation task item.
 * Shows a timeline of fix attempts with feedback, files modified,
 * constitutional result, and status (fix_applied or fix_blocked).
 * FR-134: Fix Build Command Enhancement
 */

import { useState } from 'react';
import type { FixAuditRecord } from '@/lib/schemas/fix-audit';

interface TaskAuditTrailProps {
  auditTrail: FixAuditRecord[];
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function AuditRecordCard({ record }: { record: FixAuditRecord }) {
  const [expanded, setExpanded] = useState(false);
  const isBlocked = record.action === 'fix_blocked';
  const isApiError = record.constitutional_result.status === 'API_ERROR';
  const hasViolations = record.constitutional_result.violations.length > 0;

  return (
    <div className={`border rounded-lg p-3 ${
      isBlocked ? 'border-red-200 bg-red-50/40' : 'border-green-200 bg-green-50/40'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded ${
          isBlocked
            ? 'bg-red-100 text-red-700'
            : 'bg-green-100 text-green-700'
        }`}>
          {isBlocked ? 'Blocked' : 'Applied'}
        </span>
        {isApiError && (
          <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
            API Error
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {formatTimestamp(record.timestamp)}
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 mt-1">{record.fix_summary}</p>

      {/* Feedback snapshot */}
      {record.feedback_snapshot && (
        <div className="mt-2 text-xs text-gray-500">
          <span className="font-medium">Feedback:</span>{' '}
          <span className="italic">&quot;{record.feedback_snapshot}&quot;</span>
        </div>
      )}

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Files modified */}
          {record.files_modified.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Files modified:</p>
              <ul className="space-y-0.5">
                {record.files_modified.map((f) => (
                  <li key={f} className="text-xs font-mono text-gray-600">{f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Constitutional result */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              Constitutional check:{' '}
              <span className={
                record.constitutional_result.status === 'PASS'
                  ? 'text-green-600'
                  : 'text-red-600'
              }>
                {record.constitutional_result.status}
              </span>
            </p>
          </div>

          {/* Violations table */}
          {hasViolations && (
            <ViolationsTable violations={record.constitutional_result.violations} />
          )}
        </div>
      )}
    </div>
  );
}

interface ViolationEntry {
  rule: string;
  file_path: string;
  actual: number | string;
  limit: number | string;
}

function ViolationsTable({ violations }: { violations: ViolationEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-red-200">
            <th className="text-left py-1 pr-2 font-medium text-red-700">File</th>
            <th className="text-left py-1 pr-2 font-medium text-red-700">Rule</th>
            <th className="text-right py-1 pr-2 font-medium text-red-700">Actual</th>
            <th className="text-right py-1 font-medium text-red-700">Limit</th>
          </tr>
        </thead>
        <tbody>
          {violations.map((v, i) => (
            <tr key={`${v.file_path}-${v.rule}-${i}`} className="border-b border-red-100 last:border-0">
              <td className="py-1 pr-2 font-mono text-gray-600 truncate max-w-[180px]">
                {v.file_path}
              </td>
              <td className="py-1 pr-2 text-red-600">{v.rule}</td>
              <td className="py-1 pr-2 text-right text-gray-700">{String(v.actual)}</td>
              <td className="py-1 text-right text-gray-700">{String(v.limit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TaskAuditTrail({ auditTrail }: TaskAuditTrailProps) {
  if (auditTrail.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t">
      <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Fix Audit Trail ({auditTrail.length})
      </h5>
      <div className="space-y-2">
        {auditTrail.map((record, idx) => (
          <AuditRecordCard key={`${record.timestamp}-${idx}`} record={record} />
        ))}
      </div>
    </div>
  );
}
