/**
 * Failure Guidance Panel (FR-109 v2 Journey 5)
 * Displays actionable fix guidance per test failure: root cause, source file,
 * suggested fix, severity, category. Groups related failures by shared root cause.
 */

import type { FailureGuidance, GuidanceGroup } from './automation-types';

interface FailureGuidancePanelProps {
  guidance: Array<FailureGuidance & { test_case_title?: string }>;
  groups: GuidanceGroup[];
  onUpdateStatus?: (id: string, status: 'fixing' | 'resolved' | 'dismissed') => void;
}

const SEVERITY_STYLES = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-yellow-100 text-yellow-800',
} as const;

const CATEGORY_LABELS = {
  code_bug: 'Bug',
  missing_feature: 'Missing',
  data_issue: 'Data',
  permission_error: 'Permission',
  contract_mismatch: 'Contract',
} as const;

export function FailureGuidancePanel({ guidance, groups, onUpdateStatus }: FailureGuidancePanelProps) {
  if (!guidance.length) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
        Fix Guidance
        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
          {guidance.length}
        </span>
      </h4>

      {/* Group summaries */}
      {groups.map((g) => (
        <div key={g.group_id} className="px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs">
          <span className="font-medium text-amber-800">
            {g.affected_test_count} tests share root cause:
          </span>{' '}
          <span className="text-amber-700">{g.shared_root_cause}</span>
        </div>
      ))}

      {/* Individual guidance items */}
      {guidance.map((g) => (
        <GuidanceCard key={g.id} guidance={g} onUpdateStatus={onUpdateStatus} />
      ))}
    </div>
  );
}

function GuidanceCard({
  guidance: g,
  onUpdateStatus,
}: {
  guidance: FailureGuidance & { test_case_title?: string };
  onUpdateStatus?: (id: string, status: 'fixing' | 'resolved' | 'dismissed') => void;
}) {
  const severityStyle = SEVERITY_STYLES[g.severity] || SEVERITY_STYLES.major;
  const categoryLabel = CATEGORY_LABELS[g.category] || g.category;

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      {/* Header: severity + category + test name */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${severityStyle}`}>
          {g.severity.toUpperCase()}
        </span>
        <span className="px-1.5 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-600 rounded">
          {categoryLabel}
        </span>
        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded">
          {g.tier.toUpperCase()}
        </span>
        {g.test_case_title && (
          <span className="text-xs text-gray-500 truncate">{g.test_case_title}</span>
        )}
        {g.status !== 'new' && (
          <span className="text-[9px] text-gray-400 ml-auto">{g.status}</span>
        )}
      </div>

      {/* Root cause */}
      <p className="text-xs text-gray-800 font-medium">{g.root_cause}</p>

      {/* Source file */}
      {g.likely_source?.file && (
        <div className="text-xs text-gray-500">
          <span className="font-mono text-indigo-600">{g.likely_source.file}</span>
          {g.likely_source.function && (
            <span className="text-gray-400"> → {g.likely_source.function}</span>
          )}
          {g.likely_source.line_hint && (
            <span className="text-gray-400"> ({g.likely_source.line_hint})</span>
          )}
        </div>
      )}

      {/* Suggested fix */}
      <div className="bg-gray-50 rounded p-2 text-xs font-mono text-gray-700 whitespace-pre-wrap">
        {g.suggested_fix}
      </div>

      {/* Actions */}
      {onUpdateStatus && g.status === 'new' && (
        <div className="flex gap-2">
          <button
            onClick={() => onUpdateStatus(g.id, 'fixing')}
            className="px-2 py-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100"
          >
            Start Fix
          </button>
          <button
            onClick={() => onUpdateStatus(g.id, 'dismissed')}
            className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
