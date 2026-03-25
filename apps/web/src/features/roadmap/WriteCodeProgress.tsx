/**
 * WriteCodeProgress — Writes generated code to disk via the local dev server,
 * showing animated progress as each file is written.
 */

import { useState, useEffect, useRef } from 'react';

interface FileToWrite {
  title: string;
  filePath: string;
  code: string;
}

interface WriteCodeProgressProps {
  files: FileToWrite[];
  onComplete: () => void;
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```[\w]*\s*\n([\s\S]*?)\n```\s*$/);
  if (match) return match[1];
  const inner = trimmed.match(/```[\w]*\s*\n([\s\S]*?)\n```/);
  if (inner) return inner[1];
  return trimmed;
}

async function writeFileToLocal(filePath: string, code: string): Promise<void> {
  const res = await fetch('/__api/write-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, code: stripCodeFences(code) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error ?? `Failed to write ${filePath}`);
  }
}

export function WriteCodeProgress({ files, onComplete }: WriteCodeProgressProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errors, setErrors] = useState<Array<{ filePath: string; error: string }>>([]);
  const completedRef = useRef(false);
  const writingRef = useRef(false);

  useEffect(() => {
    if (currentIndex >= files.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        const t = setTimeout(onComplete, 400);
        return () => clearTimeout(t);
      }
      return;
    }

    if (writingRef.current) return;
    writingRef.current = true;

    const file = files[currentIndex];
    writeFileToLocal(file.filePath, file.code)
      .catch((err) => {
        setErrors((prev) => [...prev, { filePath: file.filePath, error: err.message }]);
      })
      .finally(() => {
        writingRef.current = false;
        setCurrentIndex((i) => i + 1);
      });
  }, [currentIndex, files, onComplete]);

  const progressPct = files.length > 0 ? (currentIndex / files.length) * 100 : 0;
  const done = currentIndex >= files.length;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        {!done ? (
          <svg className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <h4 className="text-sm font-semibold text-blue-900">
          {done ? `All files written${errors.length > 0 ? ` (${errors.length} failed)` : ''}` : `Writing code... ${currentIndex}/${files.length}`}
        </h4>
      </div>

      <div className="w-full bg-blue-200 rounded-full h-1.5 mb-3">
        <div
          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {files.slice(0, currentIndex).map((file, i) => {
          const fileError = errors.find((e) => e.filePath === file.filePath);
          return (
            <div key={i} className="flex items-center gap-2 text-xs animate-fade-in">
              {fileError ? (
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className={`truncate ${fileError ? 'text-red-600' : 'text-gray-700'}`}>
                {file.filePath}
                {fileError && <span className="ml-1 text-red-400">— {fileError.error}</span>}
              </span>
            </div>
          );
        })}
        {currentIndex < files.length && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <span className="text-blue-700 font-medium truncate">{files[currentIndex].filePath}</span>
          </div>
        )}
      </div>
    </div>
  );
}
