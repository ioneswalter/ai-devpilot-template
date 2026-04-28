/**
 * UatReviewerReassign — admin dropdown to reassign the BP reviewer on an
 * in_review UAT package (FR-130 v2.0 / J11, T045).
 *
 * Visibility: only rendered for admin users when the package is in_review.
 * Lists all users with the BP role from `delivery_role_assignments` (FR-131).
 * Posts to /uat-reassign-reviewer; on success invalidates the UAT package
 * cache so reviewer_name re-renders.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deliveryRolesApi } from '@/lib/api/delivery-roles-api';
import { uatReviewApi } from '@/lib/api/uat-review-api';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface Props {
  packageId: string;
  currentReviewerName: string | null;
  packageStatus: 'draft' | 'in_review' | 'approved' | 'rejected';
}

function useBpReassign(packageId: string, packageStatus: string) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamQuery = useQuery({
    queryKey: ['delivery-team', 'bp-only'],
    queryFn: () => deliveryRolesApi.getTeam(),
    staleTime: 5 * 60 * 1000,
    enabled: packageStatus === 'in_review',
  });

  const bpUsers = useMemo(() => {
    const seen = new Set<string>();
    return (teamQuery.data?.assignments ?? [])
      .filter((a) => a.role_code === 'BP')
      .filter((a) => {
        if (seen.has(a.user_id)) return false;
        seen.add(a.user_id);
        return true;
      });
  }, [teamQuery.data]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await uatReviewApi.reassignReviewer(packageId, selected);
      await queryClient.invalidateQueries({ queryKey: ['uat-package'] });
      await queryClient.invalidateQueries({ queryKey: ['pipeline-status'] });
      setSelected('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reassignment failed');
    } finally {
      setBusy(false);
    }
  };

  return { selected, setSelected, busy, error, bpUsers, isLoading: teamQuery.isLoading, submit };
}

export function UatReviewerReassign({ packageId, currentReviewerName, packageStatus }: Props) {
  const isAdmin = useIsAdmin();
  const r = useBpReassign(packageId, packageStatus);
  if (!isAdmin || packageStatus !== 'in_review') return null;
  const noBPs = r.bpUsers.length === 0;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <span className="text-gray-500">Reviewer:</span>
      <span className="text-gray-700 font-medium">{currentReviewerName ?? 'Unassigned'}</span>
      <select
        value={r.selected}
        onChange={(e) => r.setSelected(e.target.value)}
        disabled={r.busy || r.isLoading || noBPs}
        className="ml-2 text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white disabled:bg-gray-100"
        aria-label="Reassign reviewer"
      >
        <option value="">{noBPs ? 'No BPs assigned to delivery team' : 'Reassign to…'}</option>
        {r.bpUsers.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            {u.user_name || u.user_email}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={r.submit}
        disabled={!r.selected || r.busy}
        className="px-2 py-0.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        data-testid="uat-reviewer-reassign-submit"
      >
        {r.busy ? 'Saving…' : 'Reassign'}
      </button>
      {r.error && (
        <span className="text-red-600 text-[11px]" role="alert">
          {r.error}
        </span>
      )}
    </div>
  );
}
