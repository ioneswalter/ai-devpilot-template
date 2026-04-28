/**
 * EscalationBanner - SE escalation notification with acknowledge/resolve actions (FR-142)
 */

import { useState } from 'react';
import type { DeployEscalation } from '@/lib/api/admin-api';

interface EscalationBannerProps {
  escalation: DeployEscalation;
  onAcknowledge: (escalationId: string) => void;
  onResolve: (escalationId: string, notes: string) => void;
  isAcknowledging: boolean;
  isResolving: boolean;
}

export function EscalationBanner({
  escalation,
  onAcknowledge,
  onResolve,
  isAcknowledging,
  isResolving,
}: EscalationBannerProps) {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const isOpen = escalation.status === 'open';
  const isAcknowledged = escalation.status === 'acknowledged';

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        isOpen ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{isOpen ? '\u26A0\uFE0F' : '\u23F8\uFE0F'}</span>
          <div>
            <h5
              className={`text-xs font-semibold uppercase tracking-wider ${
                isOpen ? 'text-red-800' : 'text-amber-800'
              }`}
            >
              {isOpen ? 'SE Escalation Required' : 'Awaiting Manual Resolution'}
            </h5>
            <p className="text-xs text-gray-700 mt-0.5">
              {escalation.step_type === 'migration' ? 'Migration' : 'Edge Function'}:{' '}
              <span className="font-mono font-medium">{escalation.step_artifact}</span>
            </p>
          </div>
        </div>

        {isOpen && (
          <button
            onClick={() => onAcknowledge(escalation.id)}
            disabled={isAcknowledging}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
          >
            {isAcknowledging ? 'Acknowledging...' : 'Acknowledge'}
          </button>
        )}
      </div>

      {/* Error details */}
      <div className="text-xs bg-white/60 border border-gray-200 rounded p-2 font-mono text-red-700 break-all">
        {escalation.error_message}
      </div>

      {escalation.fix_attempts_count > 0 && (
        <p className="text-xs text-gray-500">
          {escalation.fix_attempts_count} automated fix attempt(s) failed
        </p>
      )}

      {/* Resolve form (shown after acknowledge) */}
      {isAcknowledged && (
        <div className="space-y-2">
          {!showResolveForm ? (
            <button
              onClick={() => setShowResolveForm(true)}
              className="px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 rounded hover:bg-amber-100"
            >
              Resolve Manually
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe what you did to resolve this issue..."
                className="w-full text-xs border border-gray-300 rounded p-2 min-h-[60px] focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onResolve(escalation.id, resolutionNotes)}
                  disabled={isResolving || !resolutionNotes.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isResolving ? 'Resolving...' : 'Mark Resolved & Resume Pipeline'}
                </button>
                <button
                  onClick={() => setShowResolveForm(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
