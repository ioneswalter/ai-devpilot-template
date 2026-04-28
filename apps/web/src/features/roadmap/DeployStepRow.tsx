/**
 * DeployStepRow - Individual deployment step with status, duration, and fix attempts (FR-142)
 */

import { useState } from 'react';
import type { DeployStepResult, FixAttempt } from '@/lib/api/admin-api';

interface DeployStepRowProps {
  step: DeployStepResult;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  success: { icon: '\u2713', color: 'text-green-700 bg-green-100', label: 'Passed' },
  failed: { icon: '\u2717', color: 'text-red-700 bg-red-100', label: 'Failed' },
  skipped: { icon: '\u2014', color: 'text-gray-500 bg-gray-100', label: 'Skipped' },
  pending: { icon: '\u2022', color: 'text-gray-400 bg-gray-50', label: 'Pending' },
  running: { icon: '\u25CB', color: 'text-blue-700 bg-blue-100', label: 'Running' },
  manual_override: {
    icon: '\u2691',
    color: 'text-amber-700 bg-amber-100',
    label: 'Manual Override',
  },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function FixAttemptRow({ attempt, index }: { attempt: FixAttempt; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = attempt.status === 'success';

  return (
    <div className="py-1 border-l-2 border-amber-200 pl-2 ml-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-medium ${isSuccess ? 'text-green-600' : 'text-amber-600'}`}
          >
            Fix #{index + 1}
          </span>
          <span className="text-xs text-gray-600">{attempt.description}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={isSuccess ? 'text-green-600' : 'text-red-500'}>{attempt.status}</span>
          {attempt.error && (
            <button onClick={() => setExpanded((v) => !v)} className="text-red-500 hover:underline">
              {expanded ? 'hide' : 'error'}
            </button>
          )}
        </div>
      </div>
      {expanded && attempt.error && (
        <div className="mt-1 text-xs bg-red-50 border border-red-100 rounded p-1.5 font-mono text-red-700 break-all">
          {attempt.error}
        </div>
      )}
    </div>
  );
}

export function DeployStepRow({ step }: DeployStepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.pending;
  const label = step.action === 'execute_sql' ? 'Migration' : 'Function';
  const wasAutoFixed = (step.retry_count ?? 0) > 0 && step.status === 'success';
  const fixAttempts = step.fix_attempts ?? [];

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {step.status === 'running' ? (
            <div className="w-5 h-5 flex items-center justify-center">
              <div className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${config.color}`}
            >
              {config.icon}
            </span>
          )}
          <span className="text-xs text-gray-500">{label}</span>
          <span className="text-xs font-medium text-gray-800 truncate max-w-[200px]">
            {step.artifact}
          </span>
          {wasAutoFixed && (
            <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
              Fixed automatically
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {step.duration_ms > 0 && <span>{formatDuration(step.duration_ms)}</span>}
          {(step.error || fixAttempts.length > 0) && (
            <button onClick={() => setExpanded((v) => !v)} className="text-red-500 hover:underline">
              {expanded
                ? 'hide'
                : fixAttempts.length > 0
                  ? `${fixAttempts.length} attempt(s)`
                  : 'error'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-1 ml-7 space-y-1">
          {step.error && (
            <div className="text-xs bg-red-50 border border-red-100 rounded p-2 font-mono text-red-700 break-all">
              {step.error}
            </div>
          )}
          {fixAttempts.map((attempt, i) => (
            <FixAttemptRow key={i} attempt={attempt} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
