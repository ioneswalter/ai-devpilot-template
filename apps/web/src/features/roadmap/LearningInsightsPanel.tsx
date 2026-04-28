/**
 * LearningInsightsPanel (FR-118)
 * Shows failure patterns, constitution recommendations, and effectiveness metrics.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type { FailurePattern, ConstitutionRecommendation } from '@/lib/api/admin-api';

function PatternRow({ pattern }: { pattern: FailurePattern }) {
  const pct = Math.min(100, pattern.frequency * 10);
  const color =
    pattern.frequency >= 5 ? 'bg-red-400' : pattern.frequency >= 3 ? 'bg-amber-400' : 'bg-blue-400';
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-700 truncate block">{pattern.error_code}</span>
        <span className="text-gray-400 truncate block">{pattern.description}</span>
      </div>
      <div className="w-20 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-gray-500 font-mono">{pattern.frequency}</span>
    </div>
  );
}

function RecommendationCard({
  rec,
  onApprove,
  onDismiss,
  isActing,
}: {
  rec: ConstitutionRecommendation;
  onApprove: () => void;
  onDismiss: () => void;
  isActing: boolean;
}) {
  return (
    <div className="border rounded-lg p-2.5 bg-white space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">{rec.title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{rec.suggested_rule}</p>
        </div>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
            rec.status === 'approved'
              ? 'bg-green-100 text-green-700'
              : rec.status === 'dismissed'
                ? 'bg-gray-100 text-gray-500'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          {rec.status}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400">
        <span>{rec.evidence.failure_count} failures</span>
        <span>{rec.evidence.affected_features?.length ?? 0} features</span>
      </div>
      {rec.status === 'pending' && (
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={onApprove}
            disabled={isActing}
            className="px-2 py-1 text-[11px] font-medium text-green-700 border border-green-200 rounded hover:bg-green-50 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={onDismiss}
            disabled={isActing}
            className="px-2 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function LearningInsightsPanel() {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const { data: insights } = useQuery({
    queryKey: ['learning-insights'],
    queryFn: async () => {
      const r = await adminApi.getLearningInsights();
      return r.data;
    },
    refetchInterval: 60000,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApi.approveRecommendation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['learning-insights'] }),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => adminApi.dismissRecommendation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['learning-insights'] }),
  });

  if (!insights || insights.metrics.total_failures === 0) return null;

  const m = insights.metrics;
  const pendingRecs = insights.recommendations.filter((r) => r.status === 'pending');

  return (
    <div className="border rounded-lg bg-indigo-50 border-indigo-200 p-3 space-y-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-xs"
      >
        <span className="font-semibold text-indigo-800 uppercase tracking-wider">
          Learning Insights
        </span>
        <span className="flex items-center gap-2 text-indigo-600">
          <span>{m.total_failures} failures</span>
          <span>{m.patterns_detected} patterns</span>
          <span>{m.adaptations_active} active</span>
          {pendingRecs.length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
              {pendingRecs.length} pending
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          {insights.top_patterns.length > 0 && (
            <div>
              <h5 className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">
                Top Patterns
              </h5>
              <div className="space-y-0.5">
                {insights.top_patterns.slice(0, 5).map((p) => (
                  <PatternRow key={p.id} pattern={p} />
                ))}
              </div>
            </div>
          )}

          {insights.recommendations.length > 0 && (
            <div>
              <h5 className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">
                Recommendations
              </h5>
              <div className="space-y-1.5">
                {insights.recommendations.map((r) => (
                  <RecommendationCard
                    key={r.id}
                    rec={r}
                    onApprove={() => approveMut.mutate(r.id)}
                    onDismiss={() => dismissMut.mutate(r.id)}
                    isActing={approveMut.isPending || dismissMut.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
