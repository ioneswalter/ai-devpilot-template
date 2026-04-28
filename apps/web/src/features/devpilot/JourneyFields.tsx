/**
 * JourneyFields — Collapsible journey editor within the proposal panel.
 * Displays SpecKit-compatible journey structure (title, priority, description, scenarios).
 */

import { useState } from 'react';

export interface JourneyFormState {
  title: string;
  priority: string;
  description: string;
  why_priority: string;
  independent_test: string;
  acceptance_scenarios: string;
}

interface JourneyFieldsProps {
  journey: JourneyFormState;
  index: number;
  disabled: boolean;
  isAdmin: boolean;
  onUpdate: (updates: Partial<JourneyFormState>) => void;
}

export function JourneyFields({ journey, index, disabled, isAdmin, onUpdate }: JourneyFieldsProps) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            {journey.priority}
          </span>
          <span className="text-sm font-medium text-gray-800 truncate">
            Journey {index + 1}: {journey.title}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 py-3 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Journey Title</label>
              <input
                value={journey.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                disabled={disabled}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
              />
            </div>
            {isAdmin && (
              <div className="w-20">
                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                <select
                  value={journey.priority}
                  onChange={(e) => onUpdate({ priority: e.target.value })}
                  disabled={disabled}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50"
                >
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                  <option value="P4">P4</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={journey.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              disabled={disabled}
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none disabled:bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Acceptance Scenarios{' '}
              <span className="text-gray-400">(Given/When/Then, one per line)</span>
            </label>
            <textarea
              value={journey.acceptance_scenarios}
              onChange={(e) => onUpdate({ acceptance_scenarios: e.target.value })}
              disabled={disabled}
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none disabled:bg-gray-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}
