/**
 * TestRunHistory - Collapsible section showing past test execution runs.
 * Groups entries by date and shows result icons, notes, and executor info.
 */

import { useState } from 'react';
import { EvidenceViewer } from './EvidenceViewer';
import type { TestExecutionEntry } from './test-execution-types';
import type { GuidedTestEvidence } from './guided-testing-types';

interface TestRunHistoryProps {
  history: TestExecutionEntry[];
  isLoading: boolean;
}

function getResultIcon(result: string): string {
  switch (result) {
    case 'passed': return '\u2713';
    case 'failed': return '\u2717';
    default: return '\u2014';
  }
}

function getResultColor(result: string): string {
  switch (result) {
    case 'passed': return 'text-green-600';
    case 'failed': return 'text-red-600';
    default: return 'text-gray-400';
  }
}

function groupByDate(entries: TestExecutionEntry[]): Record<string, TestExecutionEntry[]> {
  const groups: Record<string, TestExecutionEntry[]> = {};
  for (const entry of entries) {
    const date = new Date(entry.executed_at).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
  }
  return groups;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isGuidedEvidence(evidence: Record<string, unknown> | null): boolean {
  return evidence !== null && evidence.type === 'guided' && Array.isArray(evidence.steps);
}

function isAutomatedEvidence(evidence: Record<string, unknown> | null): boolean {
  return evidence !== null && evidence.type === 'automated';
}

export function TestRunHistory({ history, isLoading }: TestRunHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewingEvidence, setViewingEvidence] = useState<GuidedTestEvidence | null>(null);
  const grouped = groupByDate(history);
  const dateKeys = Object.keys(grouped);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
      >
        <span>Test History</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 border-t">
          {isLoading && (
            <div className="py-4 text-center">
              <span className="text-xs text-gray-400">Loading history...</span>
            </div>
          )}

          {!isLoading && history.length === 0 && (
            <div className="py-4 text-center">
              <span className="text-xs text-gray-400">No test runs yet</span>
            </div>
          )}

          {!isLoading && dateKeys.map((date) => (
            <div key={date} className="mt-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {date}
              </p>
              <div className="space-y-1">
                {grouped[date].map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 py-1">
                    <span className={`text-sm font-bold flex-shrink-0 w-4 text-center ${getResultColor(entry.result)}`}>
                      {getResultIcon(entry.result)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-700 font-medium truncate">
                          {entry.test_title || entry.test_code || 'Test'}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTime(entry.executed_at)}</span>
                      </div>
                      {entry.test_code && entry.test_title && (
                        <code className="text-[10px] font-mono text-gray-400">{entry.test_code}</code>
                      )}
                      {isAutomatedEvidence(entry.evidence) && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-medium bg-indigo-50 text-indigo-600 rounded">
                          Auto
                        </span>
                      )}
                      {isGuidedEvidence(entry.evidence) && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] font-medium bg-purple-50 text-purple-600 rounded">
                          Guided
                        </span>
                      )}
                      {entry.notes && (
                        <p className="text-[10px] text-gray-500 mt-0.5 italic">{entry.notes}</p>
                      )}
                      {isGuidedEvidence(entry.evidence) && (
                        <button
                          onClick={() => setViewingEvidence(entry.evidence as unknown as GuidedTestEvidence)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium mt-0.5"
                        >
                          View Evidence
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Evidence viewer overlay */}
      {viewingEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden">
            <EvidenceViewer
              evidence={viewingEvidence}
              onClose={() => setViewingEvidence(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
