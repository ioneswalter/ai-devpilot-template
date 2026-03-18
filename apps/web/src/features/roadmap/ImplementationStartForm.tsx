/**
 * ImplementationStartForm — Initial form shown before an implementation request exists.
 * Lets admin add optional notes and trigger AI plan generation.
 */

import { useState } from 'react';

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
  requestError,
  onStart,
  onClose,
}: ImplementationStartFormProps) {
  const [notes, setNotes] = useState('');

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">
          Start the AI implementation workflow to generate a detailed implementation plan.
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
              <h4 className="text-sm font-semibold text-gray-900 mb-1">AI is generating the implementation plan...</h4>
              <p className="text-xs text-gray-500">
                Analyzing acceptance criteria, test cases, and project patterns. This may take 30-60 seconds.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Implementation Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add constraints, priorities, or special instructions for the AI..."
                className="w-full text-sm border rounded-lg px-3 py-2 h-24 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
              />
            </div>

            {requestError && (
              <p className="text-xs text-red-600">{requestError.message}</p>
            )}

            <button
              onClick={() => onStart(notes || undefined)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Start AI Implementation
            </button>
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
