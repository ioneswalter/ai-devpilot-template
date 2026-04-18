/**
 * Roadmap helper functions and small presentational components
 */

import { useState } from 'react';
import type { ProductFeatureDB } from '../../lib/api-client';

/** Normalize acceptance_criteria: handles both array and JSON-string formats */
export function parseCriteria(criteria: unknown): string[] {
  if (Array.isArray(criteria)) return criteria;
  if (typeof criteria === 'string') {
    try {
      const parsed = JSON.parse(criteria);
      return Array.isArray(parsed) ? parsed : [criteria];
    } catch {
      return [criteria];
    }
  }
  return [];
}

/**
 * Collapsible description component - shows first N lines with expand/collapse
 */
export function CollapsibleDescription({ text, maxLines = 3 }: { text: string; maxLines?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Split into lines and check if we need to truncate
  const lines = text.split(/\n|(?<=[.!?])\s+/).filter(l => l.trim());
  const needsTruncation = lines.length > maxLines;
  const displayText = needsTruncation && !isExpanded
    ? lines.slice(0, maxLines).join('. ') + '...'
    : text;

  return (
    <div className="text-xs lg:text-sm text-gray-500">
      <span className="whitespace-pre-wrap">{displayText}</span>
      {needsTruncation && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="ml-1 text-blue-600 hover:text-blue-800 font-medium"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export interface TestCase {
  id?: string;
  test_code: string;
  title: string;
  description?: string;
  test_type: string;
  priority: string;
  status: string;
  automated: boolean;
  passed?: boolean;
}

export interface ProductFeature {
  id: string;
  feature_code: string;
  title: string;
  description: string;
  acceptance_criteria: string[] | null;
  feature_type: string;
  priority: string;
  status: string;
  category: string | null;
  spec_section: string | null;
  created_at?: string;
  updated_at?: string;
  test_cases?: TestCase[];
  /** Journeys that this feature implements */
  related_user_stories?: string[];
  /** For journeys: maps each acceptance criterion index to the feature(s) that implement it */
  implementing_features?: { [criterionIndex: number]: string[] };
}

export type FilterStatus = 'all' | 'released' | 'in_development' | 'proposed' | 'reviewed' | 'specified';
export type FilterPriority = 'all' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export type FilterType = 'all' | 'journey' | 'functional_requirement';
export type FilterCategory = 'all' | 'toolkit' | 'business_module' | 'internal' | 'none';
export type FilterSection = 'all' | string;

/** Convert database feature to UI feature */
export const dbToUiFeature = (dbFeature: ProductFeatureDB): ProductFeature => {
  const implFeatures = dbFeature.implementing_features as Record<string, string[]> | null;

  return {
    id: dbFeature.id,
    feature_code: dbFeature.feature_code,
    title: dbFeature.title,
    description: dbFeature.description,
    acceptance_criteria: dbFeature.acceptance_criteria,
    feature_type: dbFeature.feature_type,
    priority: dbFeature.priority,
    status: dbFeature.status,
    category: dbFeature.category,
    spec_section: dbFeature.spec_section,
    related_user_stories: dbFeature.related_user_stories || [],
    implementing_features: implFeatures || undefined,
    created_at: dbFeature.created_at,
    updated_at: dbFeature.updated_at,
    test_cases: dbFeature.test_cases.map((tc) => ({
      id: tc.id,
      test_code: tc.test_code,
      title: tc.title,
      description: tc.description || undefined,
      test_type: tc.test_type,
      priority: tc.priority,
      status: tc.status,
      automated: tc.automated,
      passed: tc.passed ?? undefined,
    })),
  };
};
