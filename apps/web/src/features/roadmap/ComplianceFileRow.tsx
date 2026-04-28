/**
 * ComplianceFileRow — Expandable row showing file compliance status.
 * Green = pass, red = fail, amber = error. Expanded view shows violations.
 */

import { useState } from 'react';
import type { FileResult, Violation } from './compliance-types';
import { RULE_LABELS } from './compliance-types';

interface ComplianceFileRowProps {
  file: FileResult;
}

const STATUS_STYLES: Record<FileResult['status'], { bg: string; icon: string; label: string }> = {
  pass: { bg: 'bg-green-50 border-green-200', icon: '\u2713', label: 'Compliant' },
  fail: { bg: 'bg-red-50 border-red-200', icon: '\u2717', label: 'Violations found' },
  error: { bg: 'bg-amber-50 border-amber-200', icon: '\u26A0', label: 'Error' },
};

function ViolationRow({ violation }: { violation: Violation }) {
  const rule = RULE_LABELS[violation.rule];
  const severityColor =
    rule.severity === 'critical'
      ? 'text-red-700 bg-red-50'
      : rule.severity === 'high'
        ? 'text-amber-700 bg-amber-50'
        : 'text-gray-600 bg-gray-50';

  return (
    <div className="flex items-start gap-2 py-1.5 px-3 text-xs border-t border-gray-100">
      <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${severityColor}`}>
        {rule.label}
      </span>
      <span className="flex-1 text-gray-700">{violation.detail}</span>
      {violation.line !== null && (
        <span className="shrink-0 text-gray-400 font-mono">L{violation.line}</span>
      )}
      <span className="shrink-0 text-gray-500">
        {String(violation.actual)} / {String(violation.limit)}
      </span>
    </div>
  );
}

export function ComplianceFileRow({ file }: ComplianceFileRowProps) {
  const [expanded, setExpanded] = useState(file.status === 'fail');
  const style = STATUS_STYLES[file.status];
  const hasViolations = file.violations.length > 0;
  const canExpand = hasViolations || file.error !== null;

  return (
    <div className={`border rounded-lg overflow-hidden ${style.bg}`} role="row">
      <button
        type="button"
        onClick={() => canExpand && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={canExpand ? expanded : undefined}
        disabled={!canExpand}
      >
        <span className="shrink-0 w-4 text-center" aria-hidden="true">
          {style.icon}
        </span>
        <span className="flex-1 text-xs font-mono text-gray-800 truncate">{file.path}</span>
        {hasViolations && (
          <span className="shrink-0 text-xs text-red-600 font-medium">
            {file.violations.length} violation{file.violations.length > 1 ? 's' : ''}
          </span>
        )}
        {canExpand && (
          <span className="shrink-0 text-gray-400 text-xs" aria-hidden="true">
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        )}
      </button>
      {expanded && hasViolations && (
        <div className="bg-white border-t">
          {file.violations.map((v, i) => (
            <ViolationRow key={`${v.rule}-${v.line}-${i}`} violation={v} />
          ))}
        </div>
      )}
      {expanded && file.error && (
        <div className="bg-white border-t px-3 py-2 text-xs text-amber-700">{file.error}</div>
      )}
    </div>
  );
}
