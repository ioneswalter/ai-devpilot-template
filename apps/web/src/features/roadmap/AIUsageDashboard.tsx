/** AI Usage Dashboard (FR-112) — shows cost analytics, budget status, drill-down, and CSV export */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiUsageApi, type UsageAnalytics, type BudgetStatus, type UsageCosts } from '@/lib/api/ai-usage-api';

export function AIUsageDashboard() {
  const [drillFeatureId, setDrillFeatureId] = useState<string | null>(null);

  const { data: analytics } = useQuery<{ data: UsageAnalytics }>({
    queryKey: ['ai-usage-analytics'],
    queryFn: () => aiUsageApi.getAnalytics(),
    refetchInterval: 60_000,
  });

  const { data: budget } = useQuery<{ data: BudgetStatus }>({
    queryKey: ['ai-usage-budget'],
    queryFn: () => aiUsageApi.checkBudget(),
    refetchInterval: 60_000,
  });

  const { data: costs } = useQuery<{ data: UsageCosts }>({
    queryKey: ['ai-usage-costs-dashboard'],
    queryFn: () => aiUsageApi.getCosts(),
    refetchInterval: 120_000,
  });

  const stats = analytics?.data;
  const budgetData = budget?.data;
  const featureCosts = costs?.data?.by_feature ?? {};

  if (!stats && !budgetData) return null;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">AI Usage (30 days)</h4>
        <CsvExportButton />
      </div>

      {/* Budget bar */}
      {budgetData && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Budget: ${budgetData.current_spend.toFixed(2)} / ${budgetData.budget_limit.toFixed(2)}</span>
            <span className={budgetData.is_over_budget ? 'text-red-600 font-medium' : 'text-gray-500'}>
              {budgetData.percent_used.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetData.percent_used > 90 ? 'bg-red-500' : budgetData.percent_used > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, budgetData.percent_used)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            Projected: ${budgetData.projected_spend.toFixed(2)} | {budgetData.days_remaining}d remaining
          </p>
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="API Calls" value={stats.total_calls.toLocaleString()} />
          <StatCard label="Total Cost" value={`$${stats.total_cost.toFixed(2)}`} />
          <StatCard label="Models" value={Object.keys(stats.by_model).length.toString()} />
        </div>
      )}

      {/* Operation breakdown */}
      {stats && Object.keys(stats.by_operation).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500">By Operation</p>
          {Object.entries(stats.by_operation)
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([op, data]) => (
              <div key={op} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 capitalize">{op.replace(/_/g, ' ')}</span>
                <span className="text-gray-500">{data.calls} calls / ${data.cost.toFixed(2)}</span>
              </div>
            ))}
        </div>
      )}

      {/* Per-feature drill-down (FR-112 J5 T035) */}
      {Object.keys(featureCosts).length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          <p className="text-xs font-medium text-gray-500">By Feature</p>
          {Object.entries(featureCosts)
            .sort((a, b) => b[1].cost - a[1].cost)
            .slice(0, 10)
            .map(([fid, data]) => (
              <div key={fid}>
                <button
                  type="button"
                  onClick={() => setDrillFeatureId(drillFeatureId === fid ? null : fid)}
                  className="w-full flex items-center justify-between text-xs hover:bg-gray-50 rounded px-1 py-0.5"
                >
                  <span className="text-gray-600 truncate max-w-[60%]" title={fid}>{fid}</span>
                  <span className="text-gray-500">{data.calls} calls / ${data.cost.toFixed(2)}</span>
                </button>
                {drillFeatureId === fid && <FeatureDrillDown featureId={fid} />}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-gray-50 p-2 text-center">
      <p className="text-sm font-semibold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

/** Drill-down view for a specific feature's AI usage */
function FeatureDrillDown({ featureId }: { featureId: string }) {
  const { data } = useQuery({
    queryKey: ['ai-cost-breakdown', featureId],
    queryFn: () => aiUsageApi.getCostBreakdown(featureId),
    staleTime: 60_000,
  });

  const breakdown = data?.data?.breakdown;
  if (!breakdown) return <p className="text-xs text-gray-400 pl-2">Loading...</p>;

  return (
    <div className="pl-4 py-1 space-y-0.5">
      {Object.entries(breakdown)
        .sort((a, b) => b[1].cost - a[1].cost)
        .map(([op, info]) => (
          <div key={op} className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 capitalize">{op.replace(/_/g, ' ')}</span>
            <span className="text-gray-400">{info.calls} / ${info.cost.toFixed(4)}</span>
          </div>
        ))}
    </div>
  );
}

/** CSV Export button (FR-112 J5 T036) */
function CsvExportButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await aiUsageApi.getUsage({ limit: 5000 });
      const records = Array.isArray(res.data) ? res.data : [];
      if (records.length === 0) return;

      const headers = ['id', 'feature_id', 'model_id', 'operation_type', 'input_tokens', 'output_tokens', 'total_cost', 'status', 'created_at'];
      const csvRows = [
        headers.join(','),
        ...records.map(r => headers.map(h => JSON.stringify(String(r[h as keyof typeof r] ?? ''))).join(',')),
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting}
      className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
      title="Export usage data as CSV"
    >
      {exporting ? 'Exporting...' : 'Export CSV'}
    </button>
  );
}
