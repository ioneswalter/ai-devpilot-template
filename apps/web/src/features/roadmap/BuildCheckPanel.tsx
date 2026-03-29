/** BuildCheckPanel - Runs full CI pipeline: TypeScript → ESLint → Vitest */

import { useState, useCallback, useEffect } from 'react';
import { adminApi } from '@/lib/api/admin-api';
import type { BuildErrorItem, FixResultItem } from '@/lib/api/admin-api';

type PipelineStage = 'typecheck' | 'lint' | 'test';

interface StageResult {
  stage: PipelineStage;
  ok: boolean;
  errors: BuildErrorItem[];
}

interface BuildCheckPanelProps {
  onBuildPass: () => void;
  onRollback?: () => void;
  isRollingBack?: boolean;
  /** File paths that were written — scopes lint/test to these files */
  writtenFiles?: string[];
}

type PipelineState =
  | { phase: 'idle' }
  | { phase: 'running'; stage: PipelineStage; completed: StageResult[] }
  | { phase: 'pass'; completed: StageResult[] }
  | { phase: 'failed'; completed: StageResult[]; failedStage: StageResult }
  | { phase: 'fixing'; failedStage: StageResult; completed: StageResult[] }
  | { phase: 'applying'; fixes: FixResultItem[]; completed: StageResult[] }
  | { phase: 'fix-failed'; message: string; failedStage: StageResult; completed: StageResult[] };

const STAGE_LABELS: Record<PipelineStage, string> = {
  typecheck: 'TypeScript',
  lint: 'ESLint',
  test: 'Vitest',
};

export function BuildCheckPanel({ onBuildPass, onRollback, isRollingBack, writtenFiles }: BuildCheckPanelProps) {
  const [state, setState] = useState<PipelineState>({ phase: 'idle' });
  const [fixAttempts, setFixAttempts] = useState(0);

  const runPipeline = useCallback(async () => {
    const completed: StageResult[] = [];
    const stages: PipelineStage[] = ['typecheck', 'lint', 'test'];

    for (const stage of stages) {
      setState({ phase: 'running', stage, completed: [...completed] });
      const result = await runStage(stage, writtenFiles);
      if (!result.ok) {
        setState({ phase: 'failed', completed: [...completed], failedStage: result });
        return;
      }
      completed.push(result);
    }

    setState({ phase: 'pass', completed });
    onBuildPass();
  }, [onBuildPass, writtenFiles]);

  // Auto-start pipeline on mount
  useEffect(() => { runPipeline(); }, [runPipeline]);

  const fixErrors = useCallback(async (failedStage: StageResult, completed: StageResult[]) => {
    setState({ phase: 'fixing', failedStage, completed });
    setFixAttempts(prev => prev + 1);
    try {
      const uniqueFiles = [...new Set(failedStage.errors.map(e => e.file))];
      const fileContents = await Promise.all(
        uniqueFiles.map(async (filePath) => {
          const res = await fetch(`/__api/read-file?path=${encodeURIComponent(filePath)}`);
          if (!res.ok) return { path: filePath, content: '// Could not read file' };
          return { path: filePath, content: await res.text() };
        })
      );

      const result = await adminApi.fixBuildErrors({
        errors: failedStage.errors,
        files: fileContents,
        stage: failedStage.stage,
      });
      const fixes = result.data.fixes;

      if (!fixes?.length) {
        setState({ phase: 'fix-failed', message: 'AI could not determine fixes', failedStage, completed });
        return;
      }

      setState({ phase: 'applying', fixes, completed });
      for (const fix of fixes) {
        await fetch('/__api/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: fix.path, code: fix.code }),
        });
      }

      // Re-run entire pipeline from the beginning
      await new Promise(resolve => setTimeout(resolve, 500));
      await runPipeline();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ phase: 'fix-failed', message: msg, failedStage, completed });
    }
  }, [runPipeline]);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <PipelineIcon />
        CI Pipeline
      </h4>

      {/* Stage progress indicators */}
      <StageProgress state={state} />

      {state.phase === 'running' && (
        <StatusRow icon={<SpinnerIcon />} color="blue" text={`Running ${STAGE_LABELS[state.stage]}...`} />
      )}

      {state.phase === 'pass' && (
        <StatusRow icon={<CheckIcon />} color="green" text="All checks passed!" />
      )}

      {state.phase === 'failed' && (
        <ErrorsView
          stage={state.failedStage.stage}
          errors={state.failedStage.errors}
          fixAttempts={fixAttempts}
          onFix={() => fixErrors(state.failedStage, state.completed)}
          onRerun={runPipeline}
          onRollback={onRollback}
          isRollingBack={isRollingBack}
        />
      )}

      {state.phase === 'fixing' && (
        <StatusRow icon={<SpinnerIcon />} color="amber"
          text={`AI is fixing ${state.failedStage.errors.length} ${STAGE_LABELS[state.failedStage.stage]} error(s)...`} />
      )}

      {state.phase === 'applying' && (
        <StatusRow icon={<SpinnerIcon />} color="blue"
          text={`Applying ${state.fixes.length} fix(es) and re-running pipeline...`} />
      )}

      {state.phase === 'fix-failed' && (
        <div className="space-y-2">
          <StatusRow icon={<XIcon />} color="red" text={`Fix failed: ${state.message}`} />
          <div className="flex gap-2">
            <button onClick={() => fixErrors(state.failedStage, state.completed)}
              disabled={fixAttempts >= 3}
              className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50">
              {fixAttempts >= 3 ? 'Max retries reached' : 'Retry Fix'}
            </button>
            {onRollback && (
              <button onClick={onRollback} disabled={isRollingBack}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50">
                {isRollingBack ? 'Rolling back...' : 'Rollback All Changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Visual progress bar showing each pipeline stage */
function StageProgress({ state }: { state: PipelineState }) {
  const stages: PipelineStage[] = ['typecheck', 'lint', 'test'];
  const completed = 'completed' in state ? state.completed : [];
  const currentStage = state.phase === 'running' ? state.stage : null;
  const failedStage = 'failedStage' in state ? state.failedStage.stage : null;

  return (
    <div className="flex gap-1">
      {stages.map(stage => {
        const passed = completed.some(c => c.stage === stage && c.ok);
        const failed = failedStage === stage;
        const running = currentStage === stage;
        let bg = 'bg-gray-200 text-gray-500';
        if (passed) bg = 'bg-green-100 text-green-700';
        if (failed) bg = 'bg-red-100 text-red-700';
        if (running) bg = 'bg-blue-100 text-blue-700';
        return (
          <div key={stage} className={`flex-1 px-2 py-1 rounded text-xs font-medium text-center ${bg}`}>
            {running && <span className="inline-block w-2 h-2 mr-1 rounded-full bg-blue-500 animate-pulse" />}
            {passed && <span className="mr-1">&#10003;</span>}
            {failed && <span className="mr-1">&#10007;</span>}
            {STAGE_LABELS[stage]}
          </div>
        );
      })}
    </div>
  );
}

function ErrorsView({ stage, errors, fixAttempts, onFix, onRerun, onRollback, isRollingBack }: {
  stage: PipelineStage; errors: BuildErrorItem[]; fixAttempts: number;
  onFix: () => void; onRerun: () => void; onRollback?: () => void; isRollingBack?: boolean;
}) {
  const fileCount = new Set(errors.map(e => e.file)).size;
  const btn = 'px-3 py-1.5 text-xs font-medium rounded-md';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-red-700">
          {errors.length} {STAGE_LABELS[stage]} error{errors.length !== 1 ? 's' : ''} in {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <button onClick={onRerun} className={`${btn} text-gray-600 bg-gray-100 hover:bg-gray-200`}>Re-run</button>
          <button onClick={onFix} disabled={fixAttempts >= 3}
            className={`${btn} bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5`}>
            <WandIcon />
            {fixAttempts >= 3 ? 'Max retries' : fixAttempts > 0 ? `Fix (attempt ${fixAttempts + 1})` : 'Fix with AI'}
          </button>
          {onRollback && (
            <button onClick={onRollback} disabled={isRollingBack}
              className={`${btn} text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50`}>
              {isRollingBack ? 'Rolling back...' : 'Rollback'}
            </button>
          )}
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 text-xs font-mono bg-gray-900 text-gray-100 rounded-md p-3">
        {errors.slice(0, 30).map((e, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-red-400 flex-shrink-0">{e.code}</span>
            <span className="text-gray-400 flex-shrink-0">{e.file}:{e.line}</span>
            <span className="text-gray-200 truncate">{e.message}</span>
          </div>
        ))}
        {errors.length > 30 && <div className="text-gray-500 pt-1">... and {errors.length - 30} more</div>}
      </div>
    </div>
  );
}

/** Run a single pipeline stage, returning structured errors */
async function runStage(stage: PipelineStage, writtenFiles?: string[]): Promise<StageResult> {
  const endpoint = stage === 'typecheck' ? '/__api/build-check'
    : stage === 'lint' ? '/__api/lint-check'
    : '/__api/test-check';

  const body = stage !== 'typecheck' && writtenFiles?.length
    ? JSON.stringify({ files: writtenFiles }) : '{}';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json();
    const errors: BuildErrorItem[] = (data.errors ?? []).map((e: Record<string, unknown>) => ({
      file: e.file ?? e.filePath ?? '',
      line: e.line ?? 0,
      col: e.col ?? e.column ?? 0,
      code: e.code ?? e.ruleId ?? e.testName ?? stage,
      message: e.message ?? e.testName ?? 'Unknown error',
    }));
    return { stage, ok: data.ok, errors };
  } catch {
    return { stage, ok: false, errors: [{ file: '', line: 0, col: 0, code: stage, message: `Failed to run ${stage}` }] };
  }
}

function StatusRow({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-700 bg-blue-50', green: 'text-green-700 bg-green-50',
    amber: 'text-amber-700 bg-amber-50', red: 'text-red-700 bg-red-50',
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium ${colors[color] ?? ''}`}>
      {icon}{text}
    </div>
  );
}

const icon = (d: string, cls = 'w-3.5 h-3.5') => (
  <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);
const PipelineIcon = () => icon('M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', 'w-4 h-4');
const CheckIcon = () => icon('M5 13l4 4L19 7');
const XIcon = () => icon('M6 18L18 6M6 6l12 12');
const SpinnerIcon = () => (
  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const WandIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 4-1.17 2.34L11.5 7.5l2.33 1.16L15 11l1.17-2.34L18.5 7.5l-2.33-1.16z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m2 22 10-10m0 0 4-4" />
  </svg>
);
