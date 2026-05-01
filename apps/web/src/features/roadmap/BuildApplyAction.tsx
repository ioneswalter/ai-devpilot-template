/**
 * FR-159: BuildApplyAction — single context-aware Apply affordance.
 *
 * Replaces the legacy Implement + Write Code two-step (`ImplementationFooter`
 * buttons + `WriteCodeFlow` orchestrator). Decides which of four UI branches
 * to render based on derived state, and on click posts a single `/__api/apply-feature`
 * call that backs up, writes, runs tsc, and rolls back atomically on failure.
 *
 * Branches:
 *   - apply             → primary "Apply (N)" button
 *   - already_applied   → passive "Code already applied" indicator
 *   - pipeline_bootstrap→ "Hand-implemented — apply via Claude Code" notice
 *   - build_in_progress → disabled button with "Build in progress" tooltip
 */

import { useMemo, useState } from 'react';
import type { ImplementationTaskItem } from '@/lib/api/admin-api';
import { useApplyFeature } from './useApplyFeature';

export type BuildApplyAffordance =
  | 'apply'
  | 'already_applied'
  | 'pipeline_bootstrap'
  | 'build_in_progress';

interface BuildApplyActionProps {
  featureCode: string;
  featureId: string;
  taskItems: ImplementationTaskItem[];
  isPipelineBootstrap: boolean;
  featureCodeApplied: boolean;
  buildInProgress: boolean;
  codeAppliedAt: string | null;
  complianceBlocked: boolean;
  onApplied: () => Promise<void>;
}

function decideAffordance(p: {
  isPipelineBootstrap: boolean;
  featureCodeApplied: boolean;
  buildInProgress: boolean;
  pendingApplyCount: number;
}): BuildApplyAffordance {
  if (p.isPipelineBootstrap) return 'pipeline_bootstrap';
  if (p.featureCodeApplied) return 'already_applied';
  if (p.buildInProgress) return 'build_in_progress';
  if (p.pendingApplyCount > 0) return 'apply';
  return 'already_applied';
}

function useApplyHandler(
  featureCode: string,
  featureId: string,
  applyableFiles: { filePath: string; code: string }[],
  onApplied: () => Promise<void>
) {
  const [postRollback, setPostRollback] = useState<{ summary: string } | null>(null);
  const apply = useApplyFeature();
  const handleApply = async () => {
    setPostRollback(null);
    try {
      const result = await apply.mutateAsync({ featureCode, featureId, files: applyableFiles });
      if (result.status === 'applied') {
        await onApplied();
      } else if (result.status === 'rolled_back' || result.status === 'rollback_incomplete') {
        const summary =
          'build_check' in result && result.build_check.summary
            ? result.build_check.summary
            : 'Build check failed; files restored.';
        setPostRollback({ summary });
      }
    } catch (err) {
      setPostRollback({
        summary: err instanceof Error ? err.message : 'Apply failed (see console).',
      });
    }
  };
  return { handleApply, postRollback, isPending: apply.isPending };
}

function selectApplyableFiles(items: ImplementationTaskItem[]) {
  return items
    .filter(
      (t) =>
        t.decision === 'accepted' &&
        t.implementation_status === 'completed' &&
        t.generated_code &&
        (t.code_source ?? 'ai_generated') === 'ai_generated' &&
        t.file_path &&
        t.file_path !== 'n/a'
    )
    .map((t) => ({ filePath: t.file_path, code: t.generated_code as string }));
}

export function BuildApplyAction({
  featureCode,
  featureId,
  taskItems,
  isPipelineBootstrap,
  featureCodeApplied,
  buildInProgress,
  codeAppliedAt,
  complianceBlocked,
  onApplied,
}: BuildApplyActionProps) {
  const applyableFiles = useMemo(() => selectApplyableFiles(taskItems), [taskItems]);
  const affordance = decideAffordance({
    isPipelineBootstrap,
    featureCodeApplied,
    buildInProgress,
    pendingApplyCount: applyableFiles.length,
  });
  const { handleApply, postRollback, isPending } = useApplyHandler(
    featureCode,
    featureId,
    applyableFiles,
    onApplied
  );

  if (affordance === 'pipeline_bootstrap') return <PipelineBootstrapNotice />;
  if (affordance === 'already_applied') return <AlreadyAppliedIndicator codeAppliedAt={codeAppliedAt} />;
  if (affordance === 'build_in_progress') return <DisabledBuildInProgress />;

  return (
    <ApplyButtonRow
      count={applyableFiles.length}
      isPending={isPending}
      complianceBlocked={complianceBlocked}
      postRollback={postRollback}
      onClick={handleApply}
    />
  );
}

interface ApplyButtonRowProps {
  count: number;
  isPending: boolean;
  complianceBlocked: boolean;
  postRollback: { summary: string } | null;
  onClick: () => void;
}

function ApplyButtonRow({
  count,
  isPending,
  complianceBlocked,
  postRollback,
  onClick,
}: ApplyButtonRowProps) {
  const label = isPending
    ? 'Applying…'
    : postRollback
      ? `Retry Apply (${count})`
      : `Apply (${count})`;
  return (
    <div className="flex flex-col gap-2">
      {postRollback && <PostRollbackNotice summary={postRollback.summary} />}
      <button
        onClick={onClick}
        disabled={isPending || complianceBlocked}
        title={complianceBlocked ? 'Resolve constitution violations before applying' : undefined}
        data-testid="build-apply-button"
        className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 ${
          complianceBlocked
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
        }`}
      >
        {isPending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner /> {label}
          </span>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function AlreadyAppliedIndicator({ codeAppliedAt }: { codeAppliedAt: string | null }) {
  const when = codeAppliedAt ? new Date(codeAppliedAt).toLocaleString() : 'previously';
  return (
    <div
      data-testid="build-apply-already-applied"
      className="px-3 py-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md inline-flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span>
        Code already applied <span className="text-emerald-600">· {when}</span>
      </span>
    </div>
  );
}

function PipelineBootstrapNotice() {
  return (
    <div
      data-testid="build-apply-bootstrap-notice"
      className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md max-w-md"
    >
      <div className="font-medium mb-0.5">Hand-implemented — apply via Claude Code</div>
      <div className="text-amber-600">
        This feature modifies the AI DevPilot pipeline itself, so it is hand-applied rather than
        run through the auto-implementer.
      </div>
    </div>
  );
}

function DisabledBuildInProgress() {
  return (
    <button
      disabled
      title="Build in progress — wait for completion"
      data-testid="build-apply-disabled-running"
      className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-300 text-gray-600 cursor-not-allowed inline-flex items-center gap-2"
    >
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
      Build in progress…
    </button>
  );
}

function PostRollbackNotice({ summary }: { summary: string }) {
  return (
    <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md max-w-md">
      <div className="font-medium mb-0.5">Apply rolled back — files restored</div>
      <div className="text-rose-600 whitespace-pre-wrap">{summary}</div>
    </div>
  );
}
