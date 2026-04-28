/**
 * DeduplicationWarning — Modal showing matched features before proposal submission
 * Displays feature matches with similarity, status, and recommendations
 */

import { useState } from 'react';
import { AlertTriangleIcon, XIcon } from './icons';
import type { DedupMatch } from './types';

export interface DedupDecision {
  feature_code: string;
  action:
    | 'use_existing'
    | 'enhance_existing'
    | 'converge'
    | 'version_bump'
    | 'merge_in_flight'
    | 'different';
}

interface DeduplicationWarningProps {
  matches: DedupMatch[];
  onSubmitAnyway: (decisions: DedupDecision[]) => void;
  onCancel: () => void;
}

const similarityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
};

const statusColors: Record<string, string> = {
  released: 'bg-green-100 text-green-700',
  proposed: 'bg-blue-100 text-blue-700',
  specified: 'bg-purple-100 text-purple-700',
  in_development: 'bg-orange-100 text-orange-700',
};

const recommendationLabels: Record<string, string> = {
  use_existing: 'Use existing feature',
  enhance_existing: 'Enhance existing feature',
  converge: 'Converge with existing',
};

export function DeduplicationWarning({
  matches,
  onSubmitAnyway,
  onCancel,
}: DeduplicationWarningProps) {
  const [decisions, setDecisions] = useState<Record<string, DedupDecision['action'] | null>>({});
  const hasHighSimilarity = matches.some((m) => m.similarity === 'high');
  const allReviewed = matches.length > 0 && matches.every((m) => decisions[m.feature_code] != null);

  const setDecision = (featureCode: string, action: DedupDecision['action']) => {
    setDecisions((prev) => ({
      ...prev,
      [featureCode]: prev[featureCode] === action ? null : action,
    }));
  };

  const handleSubmit = () => {
    const result: DedupDecision[] = matches.map((m) => ({
      feature_code: m.feature_code,
      action: decisions[m.feature_code] ?? 'different',
    }));
    onSubmitAnyway(result);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900">Potential Duplicates Found</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-sm text-gray-600 mb-3">
            {hasHighSimilarity
              ? 'Your proposal has high overlap with existing features. Consider enhancing an existing feature instead.'
              : 'Some existing features may overlap with your proposal. Please review each match before submitting.'}
          </p>

          {matches.map((match) => {
            const chosen = decisions[match.feature_code];
            const isAccepted = chosen === match.recommendation;
            const isDifferent = chosen === 'different';
            return (
              <div
                key={match.feature_code}
                className={`border rounded-lg p-3 space-y-2 transition-colors ${isAccepted ? 'border-blue-300 bg-blue-50/50' : isDifferent ? 'border-emerald-300 bg-emerald-50/50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm font-bold text-gray-900 flex-shrink-0">
                      {match.feature_code}
                    </span>
                    <span className="text-sm text-gray-900 truncate">{match.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${similarityColors[match.similarity] ?? ''}`}
                    >
                      {match.similarity}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColors[match.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {match.status.replace(/_/g, ' ')}
                    </span>
                    {match.has_in_flight_version && match.in_flight_version_label && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700"
                        title="Feature has an unreleased version in progress"
                      >
                        {match.in_flight_version_label} in-flight
                      </span>
                    )}
                  </div>
                </div>
                {match.description_excerpt && (
                  <p className="text-xs text-gray-500">{match.description_excerpt}</p>
                )}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-dashed">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name={`dedup-${match.feature_code}`}
                      checked={isAccepted}
                      onChange={() => setDecision(match.feature_code, match.recommendation)}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-blue-700">
                      {recommendationLabels[match.recommendation] ?? match.recommendation}
                      <span className="text-gray-500 font-normal">
                        {' '}
                        — update {match.feature_code} with this proposal
                      </span>
                    </span>
                  </label>
                  {match.has_in_flight_version && match.in_flight_version_label ? (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name={`dedup-${match.feature_code}`}
                        checked={chosen === 'merge_in_flight'}
                        onChange={() => setDecision(match.feature_code, 'merge_in_flight')}
                        className="h-4 w-4 border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-purple-700">
                        Add to in-flight {match.in_flight_version_label}
                        <span className="text-gray-500 font-normal">
                          {' '}
                          — append criteria to {match.feature_code} {match.in_flight_version_label}
                        </span>
                      </span>
                    </label>
                  ) : (
                    match.status === 'released' && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`dedup-${match.feature_code}`}
                          checked={chosen === 'version_bump'}
                          onChange={() => setDecision(match.feature_code, 'version_bump')}
                          className="h-4 w-4 border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-xs font-medium text-purple-700">
                          Create new version
                          <span className="text-gray-500 font-normal">
                            {' '}
                            — version bump {match.feature_code} with this proposal
                          </span>
                        </span>
                      </label>
                    )
                  )}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name={`dedup-${match.feature_code}`}
                      checked={isDifferent}
                      onChange={() => setDecision(match.feature_code, 'different')}
                      className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-emerald-700">
                      My idea is different
                      <span className="text-gray-500 font-normal"> — create a new feature</span>
                    </span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4">
          <div className="flex gap-3 justify-between items-center">
            <span className="text-xs text-gray-500">
              {allReviewed
                ? 'All matches reviewed'
                : `Review all ${matches.length} match${matches.length > 1 ? 'es' : ''} to continue`}
            </span>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Edit Idea
              </button>
              <button
                onClick={handleSubmit}
                disabled={!allReviewed}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit Proposal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
