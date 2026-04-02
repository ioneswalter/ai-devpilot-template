/** Hook to check AI budget status (FR-112 J4) */
import { useQuery } from '@tanstack/react-query';
import { aiUsageApi, type BudgetStatus } from '@/lib/api/ai-usage-api';

export function useBudgetStatus(enabled = true) {
  const { data, isLoading } = useQuery<{ data: BudgetStatus }>({
    queryKey: ['ai-budget-status'],
    queryFn: () => aiUsageApi.checkBudget(),
    enabled,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const budget = data?.data ?? null;
  const warning: 'none' | 'approaching' | 'exceeded' =
    !budget ? 'none'
    : budget.is_over_budget ? 'exceeded'
    : budget.percent_used >= 70 ? 'approaching'
    : 'none';

  return { budget, warning, isLoading };
}
