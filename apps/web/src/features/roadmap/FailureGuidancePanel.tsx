/**
 * Failure Guidance Panel (FR-137 T003/T004/T007/T008/T009)
 * Displays AI-generated failure guidance grouped by category.
 * Each group shows root cause, severity, source attribution, and suggested fix.
 * FixTestButton is only visible to admin (SE) users.
 */

import { useState } from 'react';
import { useFailureGuidance } from './useFailureGuidance';
import {
  SeverityBadge,
  CategoryLabel,
  SourceAttribution,
  FixTestButton,
  getCategoryLabel,
} from './FailureGuidanceWidgets';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { FailureGuidance, GuidanceCategory } from './automation-test-types';

interface FailureGuidancePanelProps {
  featureId: string;
  featureCode: string;
}

type GuidanceItem = FailureGuidance & { test_case_title: string };

interface GroupedGuidance {
  category: GuidanceCategory;
  items: GuidanceItem[];
}

function groupByCategory(guidance: GuidanceItem[]): GroupedGuidance[] {
  const map = new Map<GuidanceCategory, GuidanceItem[]>();
  for (const item of guidance) {
    const existing = map.get(item.category) ?? [];
    existing.push(item);
    map.set(item.category, existing);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}

export function FailureGuidancePanel({ featureId, featureCode }: FailureGuidancePanelProps) {
  const { guidance, isLoading, error } = useFailureGuidance(featureId);
  const isAdmin = useIsAdmin();

  if (isLoading) {
    return <GuidanceLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-xs text-red-700">Failed to load failure guidance: {error.message}</p>
      </div>
    );
  }

  const activeGuidance = guidance.filter(
    (g) => g.status !== 'resolved' && g.status !== 'dismissed'
  );
  if (activeGuidance.length === 0) return null;

  const groups = groupByCategory(activeGuidance);

  return (
    <div className="space-y-3" role="region" aria-label="Failure Guidance">
      <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider flex items-center gap-2">
        Failure Guidance
        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">
          {activeGuidance.length}
        </span>
      </h4>

      {groups.map((group) => (
        <GuidanceCategoryGroup
          key={group.category}
          group={group}
          featureCode={featureCode}
          showFixButton={isAdmin}
        />
      ))}
    </div>
  );
}

// --- Category Group (collapsible) ---

function GuidanceCategoryGroup({
  group,
  featureCode,
  showFixButton,
}: {
  group: GroupedGuidance;
  featureCode: string;
  showFixButton: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const groupId = `guidance-group-${group.category}`;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        aria-expanded={expanded}
        aria-controls={groupId}
      >
        <span className="flex items-center gap-2">
          <CategoryLabel category={group.category} />
          <span className="text-[10px] text-gray-500">
            {group.items.length} {group.items.length === 1 ? 'issue' : 'issues'}
          </span>
        </span>
        <span className="text-xs text-gray-400">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div
          id={groupId}
          role="region"
          aria-label={`${getCategoryLabel(group.category)} failures`}
          className="p-2 space-y-2"
        >
          {group.items.map((item) => (
            <GuidanceCard
              key={item.id}
              item={item}
              featureCode={featureCode}
              showFixButton={showFixButton}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Individual guidance card ---

function GuidanceCard({
  item,
  featureCode,
  showFixButton,
}: {
  item: GuidanceItem;
  featureCode: string;
  showFixButton: boolean;
}) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-white">
      <div className="flex items-start gap-2 flex-wrap">
        <SeverityBadge severity={item.severity} />
        <span className="px-1.5 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-600 rounded">
          {item.tier.toUpperCase()}
        </span>
        <span className="text-xs text-gray-700 flex-1">{item.test_case_title}</span>
      </div>

      {/* Root cause */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-gray-500 uppercase">Root Cause</p>
        <p className="text-xs text-gray-800">{item.root_cause}</p>
      </div>

      {/* Source attribution */}
      {item.likely_source?.file && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-gray-500 uppercase">Source</p>
          <SourceAttribution source={item.likely_source} />
        </div>
      )}

      {/* Suggested fix */}
      <div className="bg-green-50 border border-green-100 rounded p-2">
        <p className="text-[10px] font-medium text-green-700 uppercase mb-1">Suggested Fix</p>
        <p className="text-xs text-green-800">{item.suggested_fix}</p>
      </div>

      {/* Fix button (admin/SE only — T008) */}
      {showFixButton && (
        <div className="flex justify-end">
          <FixTestButton
            groupId={item.group_id ?? item.id}
            fileRef={item.likely_source?.file}
            featureCode={featureCode}
          />
        </div>
      )}
    </div>
  );
}

// --- Loading skeleton ---

function GuidanceLoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-label="Loading failure guidance">
      <div className="h-4 w-40 bg-gray-200 rounded" />
      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="h-3 w-3/4 bg-gray-100 rounded" />
      </div>
      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="h-3 w-3/4 bg-gray-100 rounded" />
      </div>
    </div>
  );
}
