/**
 * TestCaseStatusCard — Read-only test case display for the status view.
 * Shows pass/fail/skipped/not-run state with appropriate icons and labels.
 */


interface TestCaseStatusCardProps {
  testCode: string;
  title: string;
  passed: boolean | null;
  isSkipped: boolean;
}

const CHECK_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

const CROSS_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
  </svg>
);

const SKIP_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
  </svg>
);

const PENDING_ICON = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 002 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
  </svg>
);

function getStatusIcon(passed: boolean | null, isSkipped: boolean) {
  if (passed === true) return CHECK_ICON;
  if (passed === false) return CROSS_ICON;
  if (isSkipped) return SKIP_ICON;
  return PENDING_ICON;
}

export function TestCaseStatusCard({ testCode, title, passed, isSkipped }: TestCaseStatusCardProps) {
  const borderClass = passed === false
    ? 'border-red-200 bg-red-50'
    : passed === true
      ? 'border-gray-100 bg-white'
      : isSkipped
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-amber-200 bg-amber-50';

  const iconColor = passed === true
    ? 'text-green-500'
    : passed === false
      ? 'text-red-500'
      : isSkipped
        ? 'text-amber-500'
        : 'text-amber-400';

  return (
    <div className={`flex items-start gap-3 text-sm p-3 rounded-lg border ${borderClass}`}>
      <span className={`flex-shrink-0 mt-0.5 ${iconColor}`}>
        {getStatusIcon(passed, isSkipped)}
      </span>
      <div className="flex-1 min-w-0">
        <code className="text-xs font-mono text-gray-400">{testCode}</code>
        <p className="text-gray-800 mt-0.5 leading-snug">{title}</p>
        {isSkipped && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Skipped in last run
          </span>
        )}
      </div>
    </div>
  );
}
