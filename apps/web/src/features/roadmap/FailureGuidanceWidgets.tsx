/**
 * Shared sub-components for FailureGuidancePanel (FR-137 T002 + T006)
 * SeverityBadge, CategoryLabel, SourceAttribution, FixTestButton
 */

import { useState, useCallback } from 'react';
import type { GuidanceSeverity, GuidanceCategory, LikelySource } from './automation-test-types';

// --- Severity Badge ---

const SEVERITY_STYLES: Record<GuidanceSeverity, string> = {
  critical: 'bg-red-100 text-red-700',
  major: 'bg-amber-100 text-amber-700',
  minor: 'bg-gray-100 text-gray-600',
};

interface SeverityBadgeProps {
  severity: GuidanceSeverity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${SEVERITY_STYLES[severity]}`}
      aria-label={`Severity: ${severity}`}
    >
      {severity}
    </span>
  );
}

// --- Category Label ---

const CATEGORY_CONFIG: Record<GuidanceCategory, { label: string; icon: string; color: string }> = {
  code_bug: { label: 'Code Bug', icon: '!', color: 'text-red-600 bg-red-50' },
  missing_feature: { label: 'Missing Feature', icon: '+', color: 'text-purple-600 bg-purple-50' },
  data_issue: { label: 'Data Issue', icon: '~', color: 'text-amber-600 bg-amber-50' },
  permission_error: { label: 'Permission Error', icon: '#', color: 'text-orange-600 bg-orange-50' },
  contract_mismatch: { label: 'Contract Mismatch', icon: '?', color: 'text-blue-600 bg-blue-50' },
};

interface CategoryLabelProps {
  category: GuidanceCategory;
}

export function CategoryLabel({ category }: CategoryLabelProps) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.code_bug;
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded ${config.color}`}>
      {config.icon} {config.label}
    </span>
  );
}

export function getCategoryLabel(category: GuidanceCategory): string {
  return CATEGORY_CONFIG[category]?.label ?? category;
}

// --- Source Attribution ---

interface SourceAttributionProps {
  source: LikelySource;
}

export function SourceAttribution({ source }: SourceAttributionProps) {
  return (
    <span className="font-mono text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
      {source.file}
      {source.function ? ` :: ${source.function}` : ''}
      {source.line_hint ? ` (L${source.line_hint})` : ''}
    </span>
  );
}

// --- Fix Test Button ---

interface FixTestButtonProps {
  groupId: string;
  fileRef: string | undefined;
  featureCode: string;
  disabled?: boolean;
}

export function FixTestButton({ groupId, fileRef, featureCode, disabled }: FixTestButtonProps) {
  const [copied, setCopied] = useState(false);
  const noFile = !fileRef;
  const isDisabled = disabled || noFile;

  const handleCopy = useCallback(async () => {
    if (isDisabled) return;
    const command = `\\fix-test ${featureCode} [group:${groupId}]`;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [featureCode, groupId, isDisabled]);

  return (
    <button
      onClick={handleCopy}
      disabled={isDisabled}
      title={noFile ? 'No source file identified' : `Copy \\fix-test command for group ${groupId}`}
      aria-label={
        noFile
          ? 'Fix button disabled: no source file identified'
          : `Copy fix-test command for ${featureCode}`
      }
      className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
        copied
          ? 'bg-green-100 text-green-700'
          : isDisabled
            ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
      }`}
    >
      {copied ? 'Copied!' : 'Fix with \\fix-test'}
    </button>
  );
}
