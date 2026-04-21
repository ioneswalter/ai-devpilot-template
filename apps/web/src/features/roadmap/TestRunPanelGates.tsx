/**
 * TestRunPanelGates — Gate views and draft utilities extracted from TestRunPanel.
 */

import { CopyableCommand } from '@/components/ui/CopyableCommand';
import type { TestRunResult } from './test-execution-types';

// --- Draft persistence utilities ---

type PanelView = 'status' | 'execute' | 'manual';

export interface TestRunDraft {
  view: PanelView;
  environment: string;
  results: Record<string, TestRunResult | null>;
  notes: Record<string, string>;
  savedAt: number;
}

const DRAFT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function getDraftKey(featureId: string): string {
  return `test-run-draft-${featureId}`;
}

export function loadDraft(featureId: string): TestRunDraft | null {
  try {
    const raw = sessionStorage.getItem(getDraftKey(featureId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as TestRunDraft;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      sessionStorage.removeItem(getDraftKey(featureId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(featureId: string, draft: Omit<TestRunDraft, 'savedAt'>): void {
  try {
    sessionStorage.setItem(getDraftKey(featureId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* sessionStorage full or unavailable */ }
}

export function clearDraft(featureId: string): void {
  try { sessionStorage.removeItem(getDraftKey(featureId)); } catch { /* ignore */ }
}

// --- Gate views ---

interface BuildRequiredGateProps {
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
}

export function BuildRequiredGate({ featureCode, featureTitle, featureStatus, onClose }: BuildRequiredGateProps) {
  const stepMsg = featureStatus === 'proposed'
    ? <>Run <CopyableCommand command={`\\review-proposal ${featureCode}`} className="bg-amber-100" /> → <CopyableCommand command="\\spec" className="bg-amber-100" /> → <CopyableCommand command="\\build" className="bg-amber-100" /> first.</>
    : featureStatus === 'reviewed'
      ? <>Run <CopyableCommand command={`\\spec ${featureCode}`} className="bg-amber-100" /> → <CopyableCommand command="\\build" className="bg-amber-100" /> first.</>
      : <>Run <CopyableCommand command={`\\build ${featureCode}`} className="bg-amber-100" /> first, then accept the build in the Roadmap UI.</>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
      </div>
      <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
        <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-800">Build Required</p>
          <p className="text-xs text-amber-700">{stepMsg}</p>
        </div>
      </div>
      <div className="flex-1" />
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    </div>
  );
}

interface BuildReviewGateProps {
  featureCode: string;
  featureTitle: string;
  buildPending: number;
  buildRejected: number;
  onClose: () => void;
}

export function BuildReviewGate({ featureCode, featureTitle, buildPending, buildRejected, onClose }: BuildReviewGateProps) {
  const msg = buildRejected > 0
    ? <>{buildRejected} build task(s) were rejected. Run <code className="font-mono bg-amber-100 px-1 rounded">\fix-build {featureCode}</code> to address feedback, then accept in the Build panel.</>
    : <>{buildPending} build task(s) are pending review. Go to the Build panel to accept or reject each task before testing.</>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
      </div>
      <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
        <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-800">Build Review Required</p>
          <p className="text-xs text-amber-700">{msg}</p>
        </div>
      </div>
      <div className="flex-1" />
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>
    </div>
  );
}
