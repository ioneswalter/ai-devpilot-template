/** AI Usage Dashboard (FR-112) — shows cost analytics and budget status */
import { useQuery } from '@tanstack/react-query';
import { aiUsageApi, type UsageAnalytics, type BudgetStatus } from '@/lib/api/ai-usage-api';

export function AIUsageDashboard() {
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

  const stats = analytics?.data;
  const budgetData = budget?.data;

  if (!stats && !budgetData) return null;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">AI Usage (30 days)</h4>

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
