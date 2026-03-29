/**
 * BuildCheckPanel - Runs tsc build check after code is written,
 * displays errors, and offers AI-powered auto-fix.
 */

import { useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/admin-api';
import type { BuildErrorItem, FixResultItem } from '@/lib/api/admin-api';

interface BuildCheckPanelProps {
  /** Called after fixes are applied and build passes */
  onBuildPass: () => void;
}

type BuildState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'pass' }
  | { phase: 'errors'; errors: BuildErrorItem[] }
  | { phase: 'fixing'; errors: BuildErrorItem[] }
  | { phase: 'applying'; fixes: FixResultItem[] }
  | { phase: 'fix-failed'; message: string; errors: BuildErrorItem[] };

export function BuildCheckPanel({ onBuildPass }: BuildCheckPanelProps) {
  const [state, setState] = useState<BuildState>({ phase: 'idle' });
  const [fixAttempts, setFixAttempts] = useState(0);

  const runBuildCheck = useCallback(async () => {
    setState({ phase: 'checking' });
    try {
      const res = await fetch('/__api/build-check', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setState({ phase: 'pass' });
        onBuildPass();
      } else {
        setState({ phase: 'errors', errors: data.errors ?? [] });
      }
    } catch {
      setState({ phase: 'errors', errors: [] });
    }
  }, [onBuildPass]);

  const fixErrors = useCallback(async (errors: BuildErrorItem[]) => {
    setState({ phase: 'fixing', errors });
    setFixAttempts(prev => prev + 1);

    try {
      // Read the content of files with errors
      const uniqueFiles = [...new Set(errors.map(e => e.file))];
      const fileContents = await Promise.all(
        uniqueFiles.map(async (filePath) => {
          const res = await fetch(`/__api/read-file?path=${encodeURIComponent(filePath)}`);
          if (!res.ok) return { path: filePath, content: '// Could not read file' };
          const content = await res.text();
          return { path: filePath, content };
        })
      );

      // Send to AI for fixing
      const result = await adminApi.fixBuildErrors({ errors, files: fileContents });
      const fixes = result.data.fixes;

      if (!fixes?.length) {
        setState({ phase: 'fix-failed', message: 'AI could not determine fixes', errors });
        return;
      }

      // Apply fixes by writing corrected files
      setState({ phase: 'applying', fixes });
      for (const fix of fixes) {
        await fetch('/__api/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: fix.path, code: fix.code }),
        });
      }

      // Re-run build check to verify
      await new Promise(resolve => setTimeout(resolve, 500));
      const recheck = await fetch('/__api/build-check', { method: 'POST' });
      const recheckData = await recheck.json();

      if (recheckData.ok) {
        setState({ phase: 'pass' });
        onBuildPass();
      } else {
        setState({ phase: 'errors', errors: recheckData.errors ?? [] });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ phase: 'fix-failed', message: msg, errors });
    }
  }, [onBuildPass]);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <BuildIcon />
          Build Check
        </h4>
        {state.phase === 'idle' && (
          <button
            onClick={runBuildCheck}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Run Build Check
          </button>
        )}
      </div>

      {state.phase === 'checking' && (
        <StatusRow icon={<SpinnerIcon />} color="blue" text="Running TypeScript build check..." />
      )}

      {state.phase === 'pass' && (
        <StatusRow icon={<CheckIcon />} color="green" text="Build passed — no errors!" />
      )}

      {state.phase === 'errors' && (
        <ErrorsView
          errors={state.errors}
          fixAttempts={fixAttempts}
          onFix={() => fixErrors(state.errors)}
          onRecheck={runBuildCheck}
        />
      )}

      {state.phase === 'fixing' && (
        <StatusRow icon={<SpinnerIcon />} color="amber" text={`AI is fixing ${state.errors.length} error${state.errors.length !== 1 ? 's' : ''}...`} />
      )}

      {state.phase === 'applying' && (
        <StatusRow icon={<SpinnerIcon />} color="blue" text={`Applying ${state.fixes.length} fix${state.fixes.length !== 1 ? 'es' : ''} and re-checking...`} />
      )}

      {state.phase === 'fix-failed' && (
        <div className="space-y-2">
          <StatusRow icon={<XIcon />} color="red" text={`Fix failed: ${state.message}`} />
          <button
            onClick={() => fixErrors(state.errors)}
            disabled={fixAttempts >= 3}
            className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50"
          >
            {fixAttempts >= 3 ? 'Max retries reached' : 'Retry Fix'}
          </button>
        </div>
      )}
    </div>
  );
}

function ErrorsView({ errors, fixAttempts, onFix, onRecheck }: {
  errors: BuildErrorItem[];
  fixAttempts: number;
  onFix: () => void;
  onRecheck: () => void;
}) {
  const byFile = new Map<string, BuildErrorItem[]>();
  for (const e of errors) {
    const list = byFile.get(e.file) ?? [];
    list.push(e);
    byFile.set(e.file, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-red-700">
          {errors.length} error{errors.length !== 1 ? 's' : ''} in {byFile.size} file{byFile.size !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onRecheck}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Re-check
          </button>
          <button
            onClick={onFix}
            disabled={fixAttempts >= 3}
            className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <WandIcon />
            {fixAttempts >= 3 ? 'Max retries' : fixAttempts > 0 ? `Fix Errors (attempt ${fixAttempts + 1})` : 'Fix Errors with AI'}
          </button>
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
        {errors.length > 30 && (
          <div className="text-gray-500 pt-1">... and {errors.length - 30} more</div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-700 bg-blue-50',
    green: 'text-green-700 bg-green-50',
    amber: 'text-amber-700 bg-amber-50',
    red: 'text-red-700 bg-red-50',
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium ${colors[color] ?? ''}`}>
      {icon}
      {text}
    </div>
  );
}

// Inline SVG icons
const BuildIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);
const SpinnerIcon = () => (
  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
const XIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const WandIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 4-1.17 2.34L11.5 7.5l2.33 1.16L15 11l1.17-2.34L18.5 7.5l-2.33-1.16z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m2 22 10-10m0 0 4-4" />
  </svg>
);
