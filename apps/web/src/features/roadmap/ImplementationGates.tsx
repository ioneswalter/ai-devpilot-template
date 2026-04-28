/**
 * Gate views for ImplementationPanel — workflow blocks shown
 * when prerequisites (spec, review) are not met.
 */

import { CopyableCommand } from '@/components/ui/CopyableCommand';

interface GateHeaderProps {
  featureCode: string;
  featureTitle: string;
}

function GateHeader({ featureCode, featureTitle }: GateHeaderProps) {
  return (
    <div className="p-4 border-b">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-xs font-mono text-blue-600">{featureCode}</code>
        <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
      </div>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      className="w-5 h-5 text-amber-500 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
      />
    </svg>
  );
}

interface SpecRequiredGateProps {
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
}

export function SpecRequiredGate({
  featureCode,
  featureTitle,
  featureStatus,
  onClose,
}: SpecRequiredGateProps) {
  const isProposed = featureStatus === 'proposed';
  return (
    <div className="flex flex-col h-full">
      <GateHeader featureCode={featureCode} featureTitle={featureTitle} />
      <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
        <WarningIcon />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-800">
            {isProposed ? 'Proposal Review Required' : 'Specification Required'}
          </p>
          <p className="text-xs text-amber-700">
            {isProposed ? (
              <>
                Run{' '}
                <CopyableCommand
                  command={`\\review-proposal ${featureCode}`}
                  className="bg-amber-100"
                />{' '}
                then <CopyableCommand command={`\\spec ${featureCode}`} className="bg-amber-100" />{' '}
                before building.
              </>
            ) : (
              <>
                Run <CopyableCommand command={`\\spec ${featureCode}`} className="bg-amber-100" />{' '}
                to generate the specification before building.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex-1" />
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    </div>
  );
}

interface ReviewBlockingGateProps {
  featureCode: string;
  featureTitle: string;
  isSentBack: boolean;
  onClose: () => void;
}

export function ReviewBlockingGate({
  featureCode,
  featureTitle,
  isSentBack,
  onClose,
}: ReviewBlockingGateProps) {
  return (
    <div className="flex flex-col h-full">
      <GateHeader featureCode={featureCode} featureTitle={featureTitle} />
      <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
        <WarningIcon />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-800">
            {isSentBack ? 'Spec Review Sent Back' : 'Spec Review In Progress'}
          </p>
          <p className="text-xs text-amber-700">
            {isSentBack
              ? 'The spec review was sent back for revision. Address the feedback in the Spec panel before building.'
              : 'The AI Spec Review is still in progress. Accept the review items and Approve in the Spec panel before building.'}
          </p>
        </div>
      </div>
      <div className="flex-1" />
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    </div>
  );
}

interface ManualImplGateProps {
  featureCode: string;
  featureTitle: string;
  isRequesting: boolean;
  onStartAnyway: () => void;
  onClose: () => void;
}

export function ManualImplGate({
  featureCode,
  featureTitle,
  isRequesting,
  onStartAnyway,
  onClose,
}: ManualImplGateProps) {
  return (
    <div className="flex flex-col h-full">
      <GateHeader featureCode={featureCode} featureTitle={featureTitle} />
      <div className="flex-1 p-4 flex items-center justify-center">
        <div className="text-center max-w-xs space-y-3">
          <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900">Implemented manually</h4>
          <p className="text-xs text-gray-500">
            This feature was implemented outside the AI workflow. You can still start an AI
            implementation to generate additional code or review tasks.
          </p>
          <button
            onClick={onStartAnyway}
            disabled={isRequesting}
            className="px-4 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {isRequesting ? 'Starting...' : 'Start AI Implementation Anyway'}
          </button>
        </div>
      </div>
      <div className="border-t p-3 flex justify-end">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    </div>
  );
}
