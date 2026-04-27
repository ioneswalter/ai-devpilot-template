/**
 * UatAuditLogModal — admin-only read-only view of uat_review_audit entries
 * for a feature (FR-130 v2.0 / J12, T049). Wired to right-click on
 * UatPipelineTile via onContextMenu.
 *
 * Reads via the supabase client; RLS policy uat_audit_select_authorized
 * permits admins (and BP/SE/BA roles) to read.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';

interface AuditEntry {
  id: string;
  package_id: string;
  cycle_number: number;
  submitted_by: string;
  prior_status: string;
  new_status: string;
  source: string | null;
  event_type: string | null;
  submitted_at: string;
}

interface Props {
  featureId: string;
  featureCode: string;
  onClose: () => void;
}

const EVENT_LABELS: Record<string, string> = {
  review_submitted: 'Review submitted',
  auto_approved: 'Auto-approved (CLI)',
  rejected_via_cli: 'Rejected via CLI',
  reviewer_reassigned: 'Reviewer reassigned',
};

export function UatAuditLogModal({ featureId, featureCode, onClose }: Props) {
  const query = useQuery({
    queryKey: ['uat-audit-log', featureId],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data: pkgs } = await supabase
        .from('uat_packages')
        .select('id')
        .eq('feature_id', featureId);
      const pkgIds = (pkgs ?? []).map((p) => p.id as string);
      if (pkgIds.length === 0) return [];
      const { data: rows, error } = await supabase
        .from('uat_review_audit')
        .select('id, package_id, cycle_number, submitted_by, prior_status, new_status, source, event_type, submitted_at')
        .in('package_id', pkgIds)
        .order('submitted_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (rows ?? []) as AuditEntry[];
    },
    staleTime: 30_000,
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">UAT Audit Log</h3>
            <p className="text-xs text-gray-500"><code className="font-mono text-blue-600">{featureCode}</code> · admin read-only</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {query.isLoading && <p className="text-xs text-gray-500">Loading audit entries…</p>}
          {query.isError && <p className="text-xs text-red-600">Error: {(query.error as Error).message}</p>}
          {!query.isLoading && query.data && query.data.length === 0 && (
            <p className="text-xs text-gray-500" data-testid="uat-audit-empty">No audit entries for this feature yet.</p>
          )}
          {query.data && query.data.length > 0 && (
            <div className="space-y-2" data-testid="uat-audit-entries">
              {query.data.map((row) => <AuditRow key={row.id} row={row} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditRow({ row }: { row: AuditEntry }) {
  const eventLabel = (row.event_type && EVENT_LABELS[row.event_type]) ?? row.event_type ?? 'unknown';
  const sourceBadge = row.source === 'cli' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600';
  return (
    <div className="border border-gray-200 rounded p-2.5 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-gray-800">{eventLabel}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${sourceBadge}`}>{row.source ?? 'ui'}</span>
        {row.cycle_number > 0 && (
          <span className="text-[10px] text-gray-500">Cycle {row.cycle_number}</span>
        )}
        <span className="text-[10px] text-gray-400 ml-auto">{new Date(row.submitted_at).toLocaleString()}</span>
      </div>
      <div className="text-[11px] text-gray-600 font-mono">
        {row.prior_status} → {row.new_status}
      </div>
      <div className="text-[10px] text-gray-400 font-mono">actor: {row.submitted_by.slice(0, 8)}…</div>
    </div>
  );
}
