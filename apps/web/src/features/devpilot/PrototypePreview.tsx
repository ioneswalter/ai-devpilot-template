/**
 * PrototypePreview — Sandboxed iframe preview panel for AI-generated prototypes.
 * Renders HTML content in an isolated iframe with loading, empty, error, and
 * disambiguation states.
 * FR-140: AI Prototype Builder
 */

import { PrototypeToolbar } from './PrototypeToolbar';
import type { PrototypeType } from '@ownyourgig/types';

interface PrototypePreviewProps {
  content: string | null;
  prototypeType: PrototypeType | null;
  isLoading: boolean;
  featureCode?: string;
  versionNumber: number;
  totalVersions: number;
  versions?: Array<{
    id: string;
    version_number: number;
    prototype_type: string;
    content: string;
    feedback_prompt: string | null;
    is_current: boolean;
    confidence: number | null;
    created_at: string;
  }>;
  onRevert?: (versionId: string) => void;
  isReverting?: boolean;
  onFinalise?: () => void;
  isFinalised?: boolean;
}

export function PrototypePreview({
  content,
  prototypeType,
  isLoading,
  featureCode,
  versionNumber,
  totalVersions,
  versions = [],
  onRevert,
  isReverting = false,
  onFinalise,
  isFinalised,
}: PrototypePreviewProps) {
  const cmdCode = featureCode || 'FR-XXX';

  // Loading state (fetching from storage)
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <div className="text-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm text-gray-500">Loading prototype...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state — command reminder
  if (!content) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300 p-6">
        <div className="text-center max-w-sm">
          <p className="text-sm font-medium text-gray-500 mb-2">No prototype yet</p>
          <p className="text-xs text-gray-400 mb-3">
            Run the following command in Claude Code to create a prototype:
          </p>
          <code className="text-xs font-mono bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded border border-indigo-200">
            \generate-prototype {cmdCode}
          </code>
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
      <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-500">
        To iterate, run{' '}
        <code className="font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
          \iterate-prototype {cmdCode} &apos;your feedback&apos;
        </code>{' '}
        in Claude Code.
      </div>
    </div>
  );
}
