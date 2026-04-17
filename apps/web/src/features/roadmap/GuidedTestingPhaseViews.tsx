/**
 * Phase views for GuidedTestingPanel — idle, loading, error, and completed states.
 */

import { ExtensionWarning, TestDataPrompt } from './GuidedTestingPanelWidgets';

interface IdleViewProps {
  extensionAvailable: boolean;
  extensionChecking: boolean;
  onStart: () => void;
}

export function IdleView({ extensionAvailable, extensionChecking, onStart }: IdleViewProps) {
  return (
    <div className="space-y-3">
      {!extensionAvailable && !extensionChecking && <ExtensionWarning />}
      <button
        onClick={onStart}
        className="w-full py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
      >
        Start AI-Guided Testing
      </button>
    </div>
  );
}

interface TestDataViewProps {
  generating: boolean;
  testCaseId: string;
  onGenerate: () => void;
  onSkip: () => void;
}

export function TestDataView({ generating, onGenerate, onSkip }: TestDataViewProps) {
  return <TestDataPrompt generating={generating} onGenerate={onGenerate} onSkip={onSkip} />;
}

interface LoadingViewProps {
  phase: 'checking-data' | 'loading';
}

export function LoadingView({ phase }: LoadingViewProps) {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
      <span className="ml-2 text-sm text-gray-600">
        {phase === 'checking-data' ? 'Checking test data...' : 'Generating guidance...'}
      </span>
    </div>
  );
}

interface ErrorViewProps {
  error: string | null;
  onRetry: () => void;
}

export function ErrorView({ error, onRetry }: ErrorViewProps) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <p className="font-medium mb-1">Guidance Error</p>
      <p className="text-xs">{error}</p>
      <button
        onClick={onRetry}
        className="mt-2 px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
      >
        Retry
      </button>
    </div>
  );
}

interface CompletedViewProps {
  stepsTotal: number;
  passed: number;
  failed: number;
}

export function CompletedView({ stepsTotal, passed, failed }: CompletedViewProps) {
  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
      <p className="font-medium text-green-800 mb-1">Guided Testing Complete</p>
      <p className="text-xs text-green-700">
        {passed} passed, {failed} failed, {stepsTotal - passed - failed} skipped
        out of {stepsTotal} steps.
      </p>
    </div>
  );
}
