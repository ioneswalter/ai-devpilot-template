/** Pipeline Dashboard: Unified view of running, queued, and completed pipelines (FR-119) */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getQueueStatus, cancelQueueEntry, type QueueStatusResponse } from '@/lib/api/admin-api';
import { PipelineQueueCard } from './PipelineQueueCard';
import { ConflictReportPanel } from './ConflictReportPanel';

export function PipelineDashboard() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<QueueStatusResponse>({
    queryKey: ['pipeline-queue-status'],
    queryFn: getQueueStatus,
    refetchInterval: 10_000,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelQueueEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-queue-status'] }),
  });

  if (isLoading) return <div className="p-4 text-sm text-gray-500">Loading pipeline dashboard...</div>;
  if (error || !data) return <div className="p-4 text-sm text-red-500">Failed to load pipeline status</div>;

  const { running, queued, recent_completed, max_concurrent, deploy_lock } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Pipeline Dashboard</h3>
        <span className="text-xs text-gray-500">
          {running.length}/{max_concurrent} slots used
          {deploy_lock.held_by_pipeline && (
            <span className="ml-2 text-amber-600">Deploy lock: {deploy_lock.feature_title}</span>
          )}
        </span>
      </div>

      {running.length > 0 && (
        <Section title="Running" count={running.length} color="green">
          {running.map((p) => (
            <PipelineQueueCard key={p.queue_entry_id} entry={p} onCancel={(id) => cancelMutation.mutate(id)} />
          ))}
        </Section>
      )}

      {queued.length > 0 && (
        <Section title="Queued" count={queued.length} color="amber">
          {queued.map((p) => (
            <PipelineQueueCard key={p.queue_entry_id} entry={p} onCancel={(id) => cancelMutation.mutate(id)} />
          ))}
        </Section>
      )}

      {running.map((p) => {
        const entry = p as Record<string, unknown>;
        if (entry.pipeline_id && typeof entry.pipeline_id === 'string') {
          return <ConflictReportPanel key={`cf-${entry.pipeline_id}`} pipelineId={entry.pipeline_id} />;
        }
        return null;
      })}

      {recent_completed.length > 0 && (
        <Section title="Recent" count={recent_completed.length} color="gray">
          {recent_completed.slice(0, 5).map((p) => (
            <PipelineQueueCard key={p.queue_entry_id} entry={p} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { green: 'bg-green-50 border-green-200', amber: 'bg-amber-50 border-amber-200', gray: 'bg-gray-50 border-gray-200' };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] ?? colors.gray}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-600">
        <span>{title}</span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-xs">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
