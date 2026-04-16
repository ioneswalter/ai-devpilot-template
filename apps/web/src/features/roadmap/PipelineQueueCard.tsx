/** Individual pipeline card for the queue dashboard (FR-119) */
import type { PipelineQueueEntry } from '@/lib/api/admin-api';

interface Props {
  entry: PipelineQueueEntry;
  onCancel?: (queueEntryId: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  implementing: 'Implementing', build_check: 'CI Check', build_passed: 'CI Passed',
  deploying: 'Deploying', deployed: 'Deployed', readying: 'Testing',
  waiting_for_deploy: 'Waiting for Deploy', build_failed: 'CI Failed', deploy_failed: 'Deploy Failed',
  escalated: 'Escalated',
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-100 text-green-800', queued: 'bg-amber-100 text-amber-800',
  completed: 'bg-blue-100 text-blue-800', failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

export function PipelineQueueCard({ entry, onCancel }: Props) {
  const progress = entry.progress;
  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-md bg-white p-2 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">
            {entry.feature_title ?? 'Unknown Feature'}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.status] ?? STATUS_COLORS.cancelled}`}>
            {entry.status === 'queued' ? `Queue #${entry.position}` : entry.status}
          </span>
        </div>

        {entry.status === 'running' && entry.stage && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-500">{STAGE_LABELS[entry.stage] ?? entry.stage}</span>
            {progress && progress.total > 0 && (
              <>
                <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                  <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-500">{progress.completed}/{progress.total}</span>
              </>
            )}
          </div>
        )}

        {entry.status === 'queued' && (
          <p className="mt-0.5 text-xs text-amber-600">
            Waiting for available slot (position {entry.position})
          </p>
        )}
      </div>

      {onCancel && (entry.status === 'running' || entry.status === 'queued') && (
        <button
          onClick={() => onCancel(entry.queue_entry_id)}
          className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
