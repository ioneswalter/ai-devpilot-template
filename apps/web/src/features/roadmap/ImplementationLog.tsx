/**
 * ImplementationLog — Terminal-style log showing task generation progress.
 */

import { forwardRef } from 'react';

interface TaskLogItem {
  id: string;
  title: string;
  file_path: string;
  implementation_status: string;
  ai_log?: string | null;
}

interface PipelineLogEntry {
  timestamp: string;
  level: string;
  message: string;
  task_id?: string;
}

interface ImplementationLogProps {
  taskItems: TaskLogItem[];
  isImplementing: boolean;
  pipelineLogs?: PipelineLogEntry[];
}

export const ImplementationLog = forwardRef<HTMLDivElement, ImplementationLogProps>(
  function ImplementationLog({ taskItems, isImplementing, pipelineLogs }, ref) {
    const visibleTasks = taskItems.filter((t) => t.implementation_status !== 'pending');
    const hasPipelineLogs = pipelineLogs && pipelineLogs.length > 0;

    return (
      <div ref={ref} className="bg-gray-900 rounded-lg p-3 font-mono text-xs overflow-hidden">
        <div className="flex items-center gap-2 mb-2 text-gray-400">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span className="uppercase tracking-wider font-semibold">
            {hasPipelineLogs ? 'Pipeline Log' : 'Implementation Log'}
          </span>
        </div>

        {/* Pipeline logs from server (FR-113) */}
        {hasPipelineLogs &&
          pipelineLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 min-w-0">
              <LogLevelIcon level={log.level} />
              <div className={`min-w-0 ${logLevelClass(log.level)}`}>
                <span className="text-gray-500">{formatTime(log.timestamp)}</span>
                <span className="ml-2">{log.message}</span>
              </div>
            </div>
          ))}

        {/* Task-level status (fallback for non-pipeline mode) */}
        {!hasPipelineLogs &&
          visibleTasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2 py-0.5 min-w-0">
              <TaskStatusIcon status={t.implementation_status} />
              <div className={`${statusTextClass(t.implementation_status)} min-w-0`}>
                <span className="font-medium">{t.title}</span>
                <span className="text-gray-500 ml-1 break-all">{t.file_path}</span>
                {t.ai_log && (
                  <span className="text-gray-400 block mt-0.5 break-words">— {t.ai_log}</span>
                )}
              </div>
            </div>
          ))}
        {isImplementing && <div className="text-gray-500 mt-1 animate-pulse">▊</div>}
      </div>
    );
  }
);

function TaskStatusIcon({ status }: { status: string }) {
  if (status === 'generating') {
    return (
      <span className="text-yellow-400 flex-shrink-0">
        <svg className="w-3 h-3 animate-spin inline" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </span>
    );
  }
  if (status === 'completed') {
    return <span className="text-green-400 flex-shrink-0">✓</span>;
  }
  if (status === 'split') {
    return <span className="text-blue-400 flex-shrink-0">↳</span>;
  }
  return <span className="text-red-400 flex-shrink-0">✗</span>;
}

function statusTextClass(status: string): string {
  if (status === 'generating') return 'text-yellow-300';
  if (status === 'completed') return 'text-green-300';
  if (status === 'split') return 'text-blue-300';
  return 'text-red-300';
}

function LogLevelIcon({ level }: { level: string }) {
  if (level === 'error') return <span className="text-red-400 flex-shrink-0">!</span>;
  if (level === 'warn') return <span className="text-yellow-400 flex-shrink-0">~</span>;
  return <span className="text-green-400 flex-shrink-0">&gt;</span>;
}

function logLevelClass(level: string): string {
  if (level === 'error') return 'text-red-300';
  if (level === 'warn') return 'text-yellow-300';
  return 'text-green-300';
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}
