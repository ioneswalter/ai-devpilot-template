/** File Conflict Report Panel (FR-119) — shows overlapping files between concurrent pipelines */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConflictReport, acknowledgeConflicts, type ConflictReport } from '@/lib/api/admin-api';

interface Props {
  pipelineId: string;
}

export function ConflictReportPanel({ pipelineId }: Props) {
  const qc = useQueryClient();
  const { data: report } = useQuery<ConflictReport | null>({
    queryKey: ['conflict-report', pipelineId],
    queryFn: () => getConflictReport(pipelineId),
    refetchInterval: 30_000,
  });

  const ackMutation = useMutation({
    mutationFn: () => acknowledgeConflicts(pipelineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conflict-report', pipelineId] });
      qc.invalidateQueries({ queryKey: ['pipeline-queue-status'] });
    },
  });

  if (!report || report.conflicts.length === 0) return null;

  const isPending = report.status === 'pending';

  return (
    <div
      className={`rounded-lg border p-3 ${isPending ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-orange-800">
          File Conflicts Detected ({report.conflicts.length})
        </h4>
        {isPending && (
          <button
            onClick={() => ackMutation.mutate()}
            disabled={ackMutation.isPending}
            className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {ackMutation.isPending ? 'Acknowledging...' : 'Acknowledge & Proceed'}
          </button>
        )}
        {!isPending && <span className="text-xs text-green-700">Acknowledged</span>}
      </div>

      <div className="space-y-2">
        {report.conflicts.map((conflict) => (
          <div key={conflict.file_path} className="rounded bg-white p-2 text-xs">
            <p className="font-mono font-medium text-gray-800">{conflict.file_path}</p>
            <div className="mt-1 space-y-0.5">
              {conflict.other_pipelines.map((op) => (
                <p key={op.pipeline_id} className="text-gray-500">
                  Also modified by:{' '}
                  <span className="font-medium text-gray-700">{op.feature_title}</span>
                  {op.task_title && <span className="ml-1">({op.task_title})</span>}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
