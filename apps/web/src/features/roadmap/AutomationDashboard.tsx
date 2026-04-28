/**
 * AutomationDashboard — Automation coverage metrics and hybrid execution controls (FR-109 J5)
 */

import { useState } from 'react';
import { useAutomationCoverage } from './useAutomationCoverage';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type { AutomationCoverage, TrendPoint } from './automation-types';

interface AutomationDashboardProps {
  featureId: string;
}

export function AutomationDashboard({ featureId }: AutomationDashboardProps) {
  const { coverage, loading, error, refresh } = useAutomationCoverage(featureId);
  const [checkingStale, setCheckingStale] = useState(false);
  const [staleResult, setStaleResult] = useState<string | null>(null);

  const handleCheckStaleness = async () => {
    setCheckingStale(true);
    try {
      const result = await testAutomationApi.checkStaleness(featureId);
      setStaleResult(
        result.stale_count > 0
          ? `${result.stale_count} script(s) marked stale`
          : 'All scripts up to date'
      );
      await refresh();
    } catch {
      setStaleResult('Staleness check failed');
    } finally {
      setCheckingStale(false);
    }
  };

  if (loading && !coverage) {
    return <div className="text-xs text-gray-400 p-2">Loading coverage...</div>;
  }

  if (error && !coverage) {
    return <div className="text-xs text-red-500 p-2">{error}</div>;
  }

  if (!coverage || coverage.total_test_cases === 0) {
    return null;
  }

  return (
    <div className="border border-emerald-200 rounded-lg overflow-hidden">
      <div className="bg-emerald-50 px-3 py-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-emerald-800">Automation Coverage</h4>
        <button
          onClick={handleCheckStaleness}
          disabled={checkingStale}
          className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50"
        >
          {checkingStale ? 'Checking...' : 'Check Staleness'}
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Coverage bar */}
        <CoverageBar coverage={coverage} />

        {/* Metrics grid */}
        <div className="grid grid-cols-4 gap-2">
          <MetricCard label="Automated" value={coverage.automated_count} color="green" />
          <MetricCard label="Manual" value={coverage.manual_count} color="gray" />
          <MetricCard label="Stale" value={coverage.stale_count} color="amber" />
          <MetricCard
            label="Criteria"
            value={`${coverage.criteria_automated}/${coverage.criteria_total}`}
            color="blue"
          />
        </div>

        {/* Trend chart (simple) */}
        {coverage.trend.length > 1 && <TrendChart trend={coverage.trend} />}

        {/* Stale result */}
        {staleResult && (
          <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">{staleResult}</div>
        )}
      </div>
    </div>
  );
}

function CoverageBar({ coverage }: { coverage: AutomationCoverage }) {
  const { automated_count, stale_count, total_test_cases, coverage_percentage } = coverage;
  const automatedPct = total_test_cases > 0 ? (automated_count / total_test_cases) * 100 : 0;
  const stalePct = total_test_cases > 0 ? (stale_count / total_test_cases) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">
          {automated_count}/{total_test_cases} automated ({coverage_percentage}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
        {automatedPct > 0 && (
          <div
            className="bg-green-500 h-full transition-all"
            style={{ width: `${automatedPct}%` }}
          />
        )}
        {stalePct > 0 && (
          <div className="bg-amber-400 h-full transition-all" style={{ width: `${stalePct}%` }} />
        )}
      </div>
      <div className="flex gap-3 mt-1">
        <Legend color="bg-green-500" label="Automated" />
        <Legend color="bg-amber-400" label="Stale" />
        <Legend color="bg-gray-200" label="Manual" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: 'green' | 'gray' | 'amber' | 'blue';
}) {
  const colorMap = {
    green: 'text-green-700 bg-green-50',
    gray: 'text-gray-700 bg-gray-50',
    amber: 'text-amber-700 bg-amber-50',
    blue: 'text-blue-700 bg-blue-50',
  };

  return (
    <div className={`rounded px-2 py-1.5 text-center ${colorMap[color]}`}>
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px]">{label}</div>
    </div>
  );
}

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const maxPct = Math.max(...trend.map((t) => t.percentage), 1);
  const lastFew = trend.slice(-7); // Show last 7 data points

  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-1">Coverage Trend</p>
      <div className="flex items-end gap-1 h-8">
        {lastFew.map((point, i) => (
          <div
            key={i}
            className="flex-1 bg-emerald-400 rounded-t transition-all"
            style={{ height: `${(point.percentage / maxPct) * 100}%` }}
            title={`${point.date}: ${point.percentage}%`}
          />
        ))}
      </div>
    </div>
  );
}
