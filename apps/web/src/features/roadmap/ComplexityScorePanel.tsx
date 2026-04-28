/**
 * ComplexityScorePanel (FR-117)
 * Displays complexity score badge and expandable factor breakdown.
 * Shows split tree when task has been split into subtasks.
 */

import { useState } from 'react';
import type { ComplexityScore, ImplementationTaskItem } from '@/lib/api/admin-api';

interface ComplexityScorePanelProps {
  score: ComplexityScore;
  taskItems?: ImplementationTaskItem[];
  parentTaskId?: string;
}

function ScoreBadge({ total, threshold }: { total: number; threshold: number }) {
  const color =
    total >= threshold
      ? 'bg-red-100 text-red-700 border-red-200'
      : total >= threshold * 0.6
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-green-100 text-green-700 border-green-200';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}
    >
      {total}
      {total >= threshold && <span className="ml-1 text-[10px] font-normal">split</span>}
    </span>
  );
}

function FactorRow({ name, score, detail }: { name: string; score: number; detail: string }) {
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const barColor = score >= 60 ? 'bg-red-400' : score >= 30 ? 'bg-amber-400' : 'bg-green-400';

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-gray-600 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${Math.max(4, score)}%` }}
        />
      </div>
      <span className="w-8 text-right text-gray-500 font-mono">{score}</span>
      <span className="text-gray-400 truncate max-w-[140px]" title={detail}>
        {detail}
      </span>
    </div>
  );
}

export function ComplexityScorePanel({
  score,
  taskItems,
  parentTaskId,
}: ComplexityScorePanelProps) {
  const [expanded, setExpanded] = useState(false);

  const childTasks =
    taskItems?.filter(
      (t) =>
        (t.source as string) === 'auto-split' &&
        parentTaskId &&
        t.sort_order > (taskItems.find((p) => p.id === parentTaskId)?.sort_order ?? -1)
    ) ?? [];

  return (
    <div className="border rounded-lg bg-gray-50 p-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs hover:bg-gray-100 rounded px-1 py-0.5"
      >
        <span className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">Complexity</span>
          <ScoreBadge total={score.total} threshold={score.threshold} />
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 px-1">
          {Object.entries(score.factors).map(([name, factor]) => (
            <FactorRow key={name} name={name} score={factor.score} detail={factor.detail} />
          ))}

          {childTasks.length > 0 && (
            <div className="mt-3 pt-2 border-t">
              <h5 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Split into {childTasks.length} subtasks
              </h5>
              <div className="space-y-1">
                {childTasks.map((child, i) => (
                  <div key={child.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-4 text-center text-gray-400">{i + 1}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        child.implementation_status === 'completed'
                          ? 'bg-green-400'
                          : child.implementation_status === 'failed'
                            ? 'bg-red-400'
                            : 'bg-gray-300'
                      }`}
                    />
                    <span className="truncate">{child.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-400 pt-1">
            Scored at {new Date(score.scored_at).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}
