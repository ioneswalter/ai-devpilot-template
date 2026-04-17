/**
 * Header, environment selector, and extension warning for AutomatedExecuteView.
 */

interface AutomatedExecuteHeaderProps {
  featureCode: string;
  featureTitle: string;
  environment: string;
  onEnvironmentChange: (env: string) => void;
  onSwitchToManual: () => void;
  extensionChecking: boolean;
  extensionAvailable: boolean;
  connectionError: string | null;
  phase: string;
  submitError: Error | null;
}

export function AutomatedExecuteHeader({
  featureCode,
  featureTitle,
  environment,
  onEnvironmentChange,
  onSwitchToManual,
  extensionChecking,
  extensionAvailable,
  connectionError,
  phase,
  submitError,
}: AutomatedExecuteHeaderProps) {
  return (
    <>
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">AI-powered automated test execution</p>
      </div>

      {/* Environment selector */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Environment:</label>
          <select
            value={environment}
            onChange={(e) => onEnvironmentChange(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white"
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </div>
        <button
          onClick={onSwitchToManual}
          className="text-[10px] text-gray-500 hover:text-gray-700"
        >
          Switch to Manual Testing
        </button>
      </div>

      {/* Extension warning */}
      {!extensionChecking && !extensionAvailable && phase !== 'loading' && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          <strong>Browser extension not connected.</strong>{' '}
          {connectionError?.includes('refresh')
            ? 'The extension was reloaded — please refresh this page (Cmd+R).'
            : 'Install the SpecKit DevTools extension and reload this page.'}
          <button
            onClick={() => window.location.reload()}
            className="ml-2 px-2 py-0.5 bg-amber-200 rounded hover:bg-amber-300 font-medium"
          >
            Refresh Page
          </button>
        </div>
      )}

      {submitError && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          {submitError.message}
        </div>
      )}
    </>
  );
}
