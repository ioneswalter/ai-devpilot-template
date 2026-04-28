/**
 * API Test Result View (FR-109 v2 Journey 1)
 * Displays API verification test results: endpoint, request/response, assertions.
 */

import type { ApiTestResult } from './automation-types';

interface ApiTestResultViewProps {
  result: ApiTestResult;
}

export function ApiTestResultView({ result }: ApiTestResultViewProps) {
  const statusColor =
    result.result === 'passed'
      ? 'text-green-700 bg-green-50 border-green-200'
      : 'text-red-700 bg-red-50 border-red-200';

  return (
    <div className="space-y-3 text-sm">
      {/* Header */}
      <div className={`flex items-center justify-between p-2 rounded border ${statusColor}`}>
        <span className="font-medium">{result.result === 'passed' ? 'PASSED' : 'FAILED'}</span>
        <span className="text-xs text-gray-500">{result.duration_ms}ms</span>
      </div>

      {/* API Call Details */}
      <div className="bg-gray-50 rounded p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 text-xs font-mono bg-blue-100 text-blue-800 rounded">
            {result.api_call.method}
          </span>
          <span className="font-mono text-xs text-gray-700 truncate">
            {result.api_call.endpoint}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            {result.api_call.status} · {result.api_call.duration_ms}ms
          </span>
        </div>
      </div>

      {/* Assertions */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">Assertions</h4>
        {result.assertions.map((a, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={a.passed ? 'text-green-600' : 'text-red-600'}>
              {a.passed ? '✓' : '✗'}
            </span>
            <span className="text-gray-700">{a.description}</span>
            {!a.passed && (
              <span className="text-red-500 ml-auto truncate max-w-48">
                got: {JSON.stringify(a.actual)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Negative Cases */}
      {result.negative_cases.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-gray-500 uppercase">Negative Cases</h4>
          {result.negative_cases.map((nc, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={nc.passed ? 'text-green-600' : 'text-red-600'}>
                {nc.passed ? '✓' : '✗'}
              </span>
              <span className="text-gray-700">{nc.description}</span>
              <span className="text-gray-400 ml-auto">
                {nc.actual_status} (expected {nc.expected_status})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Setup/Cleanup Status */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span>Setup: {result.setup_success ? '✓' : '✗'}</span>
        <span>Cleanup: {result.cleanup_success ? '✓' : '✗'}</span>
      </div>
    </div>
  );
}
