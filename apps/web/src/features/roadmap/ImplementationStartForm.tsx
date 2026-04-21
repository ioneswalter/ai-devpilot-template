/**
 * ImplementationStartForm — Shown before \build has been run for a feature.
 * Guides the admin to use Claude Code for implementation.
 */

import { CopyableCommand } from '@/components/ui/CopyableCommand';

interface ImplementationStartFormProps {
  featureCode: string;
  featureTitle: string;
  isRequesting: boolean;
  requestError: Error | null;
  onStart: (notes?: string) => void;
  onClose: () => void;
}

export function ImplementationStartForm({
  featureCode,
  featureTitle,
  isRequesting,
  onClose,
}: ImplementationStartFormProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">
          Implementation is managed through Claude Code using the SpecKit workflow.
        </p>
      </div>

      <div className="flex-1 p-4">
        {isRequesting ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-xs">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <svg className="animate-spin w-16 h-16 text-blue-200" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <svg className="absolute inset-0 w-16 h-16 text-blue-500 p-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-gray-900 mb-1">Building implementation tasks...</h4>
              <p className="text-xs text-gray-500">
                Analyzing acceptance criteria, test cases, and project patterns. This may take 30-60 seconds.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Claude Code instructions */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-indigo-900">How to implement this feature</h4>
              <p className="text-xs text-indigo-700">
                Run the following command in Claude Code to start the full implementation pipeline:
              </p>
              <div className="bg-white border border-indigo-200 rounded-md px-3 py-2 font-mono text-sm text-indigo-800 select-all">
                \build {featureCode}
              </div>
              <ol className="text-xs text-indigo-700 space-y-1 list-decimal list-inside">
                <li>Claude Code generates implementation tasks from the spec</li>
                <li><strong>You review each task</strong> — accept, edit, or reject before execution</li>
                <li>Accepted tasks are implemented, tested, and the roadmap is updated</li>
              </ol>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 text-center">
                After running <CopyableCommand command="\\build" className="bg-white" />, tasks will appear here for your review.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    </div>
  );
}
