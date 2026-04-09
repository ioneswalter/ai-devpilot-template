/**
 * Improvement Recommendations Panel (FR-109 v2 Journey 5)
 * Displays AI-generated improvement suggestions from passing test suites.
 * Categories: performance, UX, accessibility, coverage, reliability.
 * Admin can accept (creates task), dismiss, or defer each recommendation.
 */

import { useState } from 'react';
import type { ImprovementRecommendation, RecommendationCategory } from './automation-types';

interface ImprovementPanelProps {
  recommendations: ImprovementRecommendation[];
  onUpdateStatus?: (id: string, status: 'accepted' | 'dismissed' | 'deferred') => void;
}

const CATEGORY_CONFIG: Record<RecommendationCategory, { icon: string; color: string }> = {
  performance: { icon: '⚡', color: 'text-amber-600 bg-amber-50' },
  ux: { icon: '🎯', color: 'text-purple-600 bg-purple-50' },
  accessibility: { icon: '♿', color: 'text-blue-600 bg-blue-50' },
  coverage: { icon: '📊', color: 'text-green-600 bg-green-50' },
  reliability: { icon: '🔧', color: 'text-red-600 bg-red-50' },
};

const PRIORITY_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
} as const;

export function ImprovementPanel({ recommendations, onUpdateStatus }: ImprovementPanelProps) {
  const [filter, setFilter] = useState<RecommendationCategory | 'all'>('all');

  const filtered = filter === 'all'
    ? recommendations
    : recommendations.filter((r) => r.category === filter);

  const activeRecs = filtered.filter((r) => r.status === 'new' || r.status === 'deferred');

  if (!recommendations.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          Improvement Recommendations
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">
            {activeRecs.length}
          </span>
        </h4>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        <FilterTab label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={recommendations.length} />
        {(Object.keys(CATEGORY_CONFIG) as RecommendationCategory[]).map((cat) => {
          const count = recommendations.filter((r) => r.category === cat).length;
          if (count === 0) return null;
          return (
            <FilterTab
              key={cat}
              label={`${CATEGORY_CONFIG[cat].icon} ${cat}`}
              active={filter === cat}
              onClick={() => setFilter(cat)}
              count={count}
            />
          );
        })}
      </div>

      {/* Recommendation cards */}
      {activeRecs.map((rec) => (
        <RecommendationCard key={rec.id} recommendation={rec} onUpdateStatus={onUpdateStatus} />
      ))}

      {activeRecs.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-2">No active recommendations in this category.</p>
      )}
    </div>
  );
}

function FilterTab({ label, active, onClick, count }: {
  label: string; active: boolean; onClick: () => void; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[10px] rounded transition-colors ${
        active ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label} ({count})
    </button>
  );
}

function RecommendationCard({
  recommendation: rec,
  onUpdateStatus,
}: {
  recommendation: ImprovementRecommendation;
  onUpdateStatus?: (id: string, status: 'accepted' | 'dismissed' | 'deferred') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.coverage;
  const priorityStyle = PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.medium;

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className={`px-1.5 py-0.5 text-[10px] rounded ${config.color}`}>
          {config.icon} {rec.category}
        </span>
        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${priorityStyle}`}>
          {rec.priority}
        </span>
        <p className="text-xs text-gray-800 flex-1">{rec.observation}</p>
      </div>

      {expanded && (
        <div className="ml-2 space-y-1">
          <p className="text-xs text-gray-500">
            <span className="font-medium">Why it matters:</span> {rec.why_it_matters}
          </p>
          <p className="text-xs text-gray-700 bg-gray-50 rounded p-2">
            <span className="font-medium">Suggested action:</span> {rec.suggested_action}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? 'Less' : 'More'}
        </button>
        {onUpdateStatus && rec.status === 'new' && (
          <>
            <button
              onClick={() => onUpdateStatus(rec.id, 'accepted')}
              className="px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
            >
              Accept
            </button>
            <button
              onClick={() => onUpdateStatus(rec.id, 'deferred')}
              className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
            >
              Defer
            </button>
            <button
              onClick={() => onUpdateStatus(rec.id, 'dismissed')}
              className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-600"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
