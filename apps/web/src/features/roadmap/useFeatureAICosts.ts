/** Hook to fetch per-feature AI costs (FR-112 J3) */
import { useQuery } from '@tanstack/react-query';
import { aiUsageApi, type UsageCosts } from '@/lib/api/ai-usage-api';

export function useFeatureAICosts() {
  const { data, isLoading } = useQuery<{ data: UsageCosts }>({
    queryKey: ['ai-usage-costs'],
    queryFn: () => aiUsageApi.getCosts(),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const costsByFeature = data?.data?.by_feature ?? {};

  const getFeatureCost = (featureId: string): number | null => {
    const entry = costsByFeature[featureId];
    return entry ? entry.cost : null;
  };

  return { costsByFeature, getFeatureCost, isLoading };
}
