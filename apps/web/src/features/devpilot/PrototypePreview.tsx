/**
 * PrototypePreview — Sandboxed iframe preview panel for AI-generated prototypes.
 * Renders HTML content in an isolated iframe with loading, empty, error, and
 * disambiguation states.
 * FR-140: AI Prototype Builder
 */

import type { PrototypeType } from '@ownyourgig/types';
import { PrototypeToolbar } from './PrototypeToolbar';

interface PrototypePreviewProps {
  content: string | null;
  prototypeType: PrototypeType | null;
  isGenerating: boolean;
  error: { code: string; message: string } | null;
  disambiguation: { detected_types: PrototypeType[]; confidence: number } | null;
  onSelectType: (type: PrototypeType) => void;
  onRetry: () => void;
  versionNumber: number;
  totalVersions: number;
  versions?: Array<{ id: string; version_number: number; prototype_type: string; content: string; feedback_prompt: string | null; is_current: boolean; confidence: number | null; created_at: string }>;
  onRevert?: (versionId: string) => void;
  isReverting?: boolean;
  onFinalise?: () => void;
  isFinalised?: boolean;
}

const TYPE_LABELS: Record<PrototypeType, { label: string; icon: string }> = {
  ui: { label: 'UI Screens', icon: '🖥️' },
  flowchart: { label: 'Flowchart', icon: '🔀' },
  process: { label: 'Process Diagram', icon: '⚙️' },
};

export function PrototypePreview({
  content,
  prototypeType,
  isGenerating,
  error,
  disambiguation,
  onSelectType,
  onRetry,
  versionNumber,
  totalVersions,
  versions = [],
  onRevert,
  isReverting = false,
  onFinalise,
  isFinalised,
}: PrototypePreviewProps) {
  // Disambiguation state — ask user to choose prototype type
  if (disambiguation) {
    return (
      <div className="h-full flex items-center justify-center bg-indigo-50 rounded-lg border-2 border-indigo-300 p-6 animate-pulse-once">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎨</span>
          </div>
          <p className="text-base font-semibold text-indigo-900 mb-2">
            Choose a prototype type
          </p>
          <p className="text-sm text-indigo-600 mb-6">
            This feature has both UI and backend elements. Pick one to generate an interactive preview.
          </p>
          <div className="flex flex-col gap-3">
            {disambiguation.detected_types.map((type) => (
              <button
                key={type}
                onClick={() => onSelectType(type)}
                className="w-full px-4 py-3 text-sm font-medium rounded-lg border-2 border-indigo-200 bg-white hover:bg-indigo-100 hover:border-indigo-400 transition-colors flex items-center gap-3 justify-center shadow-sm"
              >
                <span className="text-lg">{TYPE_LABELS[type].icon}</span>
                <span>{TYPE_LABELS[type].label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-red-50 rounded-lg border border-red-200 p-6">
        <div className="text-center max-w-sm">
          <p className="text-sm font-medium text-red-700 mb-1">
            Prototype generation failed
          </p>
          <p className="text-xs text-red-600 mb-4">{error.message}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onRetry}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
            {error.code === 'GENERATION_TIMEOUT' && (
              <button
                onClick={onRetry}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Simplify &amp; Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isGenerating) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <div className="text-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-500">Generating prototype...</p>
            <p className="text-xs text-gray-400">This may take up to 30 seconds</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!content) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300 p-6">
        <div className="text-center max-w-xs">
          <p className="text-sm font-medium text-gray-500 mb-1">Prototype Preview</p>
          <p className="text-xs text-gray-400">
            Describe a feature in the chat and click "Generate Prototype" to see an interactive preview here.
          </p>
        </div>
      </div>
    );
  }

  // Render prototype in sandboxed iframe
  return (
    <div className="h-full flex flex-col rounded-lg border border-gray-200 overflow-hidden">
      <PrototypeToolbar
        prototypeType={prototypeType}
        versionNumber={versionNumber}
        totalVersions={totalVersions}
        versions={versions}
        onRevert={onRevert ?? (() => {})}
        isReverting={isReverting}
        onFinalise={onFinalise}
        isFinalised={isFinalised}
      />
      <iframe
        srcDoc={content}
        sandbox="allow-scripts"
        title="Prototype Preview"
        className="flex-1 w-full bg-white"
        style={{ border: 'none', minHeight: '400px' }}
      />
    </div>
  );
}
