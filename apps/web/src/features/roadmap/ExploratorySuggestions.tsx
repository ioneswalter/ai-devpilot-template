/**
 * ExploratorySuggestions - Shows AI-suggested exploratory tests after a failure.
 * Admin can accept (creates new test case) or dismiss each suggestion.
 */

import { useState } from 'react';
import type { ExploratorySuggestion } from './guided-testing-types';

interface ExploratorySuggestionsProps {
  suggestions: ExploratorySuggestion[];
  onAccept: (suggestion: ExploratorySuggestion) => void;
  onDismiss: (suggestionId: string) => void;
  accepting: boolean;
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  accepting,
}: {
  suggestion: ExploratorySuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  accepting: boolean;
}) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="border border-indigo-200 bg-indigo-50/50 rounded-lg p-3">
      <p className="text-xs font-medium text-indigo-900">{suggestion.title}</p>
      <p className="text-[10px] text-indigo-700 mt-0.5">{suggestion.description}</p>

      {suggestion.related_criterion && (
        <p className="text-[10px] text-purple-600 mt-1">Related: {suggestion.related_criterion}</p>
      )}
      {suggestion.overlaps_with && (
        <p className="text-[10px] text-amber-600 mt-0.5">May overlap: {suggestion.overlaps_with}</p>
      )}

      {/* Steps preview */}
      <button
        onClick={() => setShowSteps(!showSteps)}
        className="text-[10px] text-indigo-600 hover:text-indigo-700 mt-1"
      >
        {showSteps ? 'Hide steps' : `Show ${suggestion.steps.length} steps`}
      </button>

      {showSteps && (
        <ol className="mt-1 pl-4 list-decimal text-[10px] text-indigo-800 space-y-0.5">
          {suggestion.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      <p className="text-[10px] text-gray-600 mt-1">
        <span className="font-medium">Expected: </span>
        {suggestion.expected_outcome}
      </p>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={onAccept}
          disabled={accepting}
          className="px-2.5 py-1 text-[10px] rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium"
        >
          {accepting ? 'Creating...' : 'Accept & Create Test'}
        </button>
        <button
          onClick={onDismiss}
          className="px-2.5 py-1 text-[10px] rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function ExploratorySuggestions({
  suggestions,
  onAccept,
  onDismiss,
  accepting,
}: ExploratorySuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider">
        Exploratory Suggestions
      </p>
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.id}
          suggestion={s}
          onAccept={() => onAccept(s)}
          onDismiss={() => onDismiss(s.id)}
          accepting={accepting}
        />
      ))}
    </div>
  );
}
