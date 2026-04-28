/**
 * WriteCodeFlow — Orchestrates the safe Write Code pipeline:
 * 1. Review: classify files (new vs existing), let user select
 * 2. Backup: save existing files before overwriting
 * 3. Write: apply generated code to disk
 * 4. Build check: validate TypeScript compilation
 * 5. Rollback: restore from backup if build fails
 */

import { useState, useEffect, useCallback } from 'react';
import { WriteCodeProgress } from './WriteCodeProgress';
import { BuildCheckPanel } from './BuildCheckPanel';

interface FileToWrite {
  title: string;
  filePath: string;
  code: string;
}

interface FileCheckResult {
  path: string;
  exists: boolean;
  lines: number;
}

type FlowPhase = 'checking' | 'review' | 'writing' | 'build-check' | 'rolled-back';

interface WriteCodeFlowProps {
  files: FileToWrite[];
  onComplete: () => void;
  onCancel: () => void;
}

export function WriteCodeFlow({ files, onComplete, onCancel }: WriteCodeFlowProps) {
  const [phase, setPhase] = useState<FlowPhase>('checking');
  const [fileStatus, setFileStatus] = useState<FileCheckResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Check which files already exist on disk
  useEffect(() => {
    checkFiles(files.map((f) => f.filePath)).then((results) => {
      setFileStatus(results);
      // Pre-select all new files; deselect existing files by default
      const preSelected = new Set<string>();
      for (const r of results) {
        if (!r.exists) preSelected.add(r.path);
      }
      setSelected(preSelected);
      setPhase('review');
    });
  }, [files]);

  const toggleFile = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(files.map((f) => f.filePath)));
  }, [files]);

  const deselectExisting = useCallback(() => {
    setSelected(new Set(fileStatus.filter((f) => !f.exists).map((f) => f.path)));
  }, [fileStatus]);

  const startWrite = useCallback(async () => {
    // Pause HMR so Vite doesn't reload the page while we write files
    await controlHMR('pause');
    const selectedPaths = files.filter((f) => selected.has(f.filePath)).map((f) => f.filePath);
    await backupFiles(selectedPaths);
    setPhase('writing');
  }, [files, selected]);

  const handleComplete = useCallback(async () => {
    await controlHMR('resume');
    onComplete();
  }, [onComplete]);

  const handleRollback = useCallback(async () => {
    setIsRollingBack(true);
    await rollbackFiles();
    await controlHMR('resume');
    setIsRollingBack(false);
    setPhase('rolled-back');
  }, []);

  const handleCancel = useCallback(async () => {
    await controlHMR('resume');
    onCancel();
  }, [onCancel]);

  const selectedFiles = files.filter((f) => selected.has(f.filePath));
  const newCount = fileStatus.filter((f) => !f.exists).length;
  const existingCount = fileStatus.filter((f) => f.exists).length;
  const selectedExisting = fileStatus.filter((f) => f.exists && selected.has(f.path)).length;

  if (phase === 'checking') {
    return <LoadingState text="Checking files on disk..." />;
  }

  if (phase === 'rolled-back') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <RollbackIcon />
          <h4 className="text-sm font-semibold text-amber-900">Changes Rolled Back</h4>
        </div>
        <p className="text-xs text-amber-700 mb-3">
          All files have been restored to their previous state.
        </p>
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    );
  }

  if (phase === 'writing') {
    return <WriteCodeProgress files={selectedFiles} onComplete={() => setPhase('build-check')} />;
  }

  if (phase === 'build-check') {
    return (
      <BuildCheckPanel
        onBuildPass={handleComplete}
        onRollback={handleRollback}
        isRollingBack={isRollingBack}
        writtenFiles={selectedFiles.map((f) => f.filePath)}
      />
    );
  }

  // Review phase
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Review Files to Write</h4>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-blue-600 hover:underline">
            Select all
          </button>
          <button onClick={deselectExisting} className="text-blue-600 hover:underline">
            New only
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-xs">
        <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded">{newCount} new</span>
        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
          {existingCount} existing
        </span>
        <span className="text-gray-500">{selected.size} selected</span>
      </div>

      {selectedExisting > 0 && (
        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          <WarningIcon />
          <span>
            <strong>
              {selectedExisting} existing file{selectedExisting > 1 ? 's' : ''}
            </strong>{' '}
            will be overwritten. AI-generated code may not be compatible with the current codebase.
          </span>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto divide-y">
        {fileStatus.map((f) => {
          const isSelected = selected.has(f.path);
          return (
            <label
              key={f.path}
              className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 px-1 rounded"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleFile(f.path)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span
                className={`flex-1 text-xs truncate ${f.exists ? 'text-amber-700' : 'text-gray-700'}`}
              >
                {f.path}
              </span>
              {f.exists ? (
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded shrink-0">
                  {f.lines} lines
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded shrink-0">
                  new
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={startWrite}
          disabled={selected.size === 0}
          className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <WriteIcon />
          Write {selected.size} File{selected.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}

// --- API helpers ---

async function checkFiles(paths: string[]): Promise<FileCheckResult[]> {
  try {
    const res = await fetch('/__api/check-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: paths }),
    });
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return paths.map((p) => ({ path: p, exists: false, lines: 0 }));
  }
}

async function backupFiles(paths: string[]): Promise<void> {
  await fetch('/__api/backup-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: paths }),
  });
}

async function rollbackFiles(): Promise<void> {
  await fetch('/__api/rollback-files', { method: 'POST' });
}

async function controlHMR(action: 'pause' | 'resume'): Promise<void> {
  await fetch('/__api/hmr-control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

// --- Inline icons ---

const LoadingState = ({ text }: { text: string }) => (
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
    <svg className="w-5 h-5 text-blue-600 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    <span className="text-sm text-blue-800">{text}</span>
  </div>
);

const WarningIcon = () => (
  <svg
    className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
    />
  </svg>
);

const RollbackIcon = () => (
  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  </svg>
);

const WriteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
    />
  </svg>
);
