/**
 * Hook for managing AI model selection with persistence and cost estimation
 */
import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAIModels, saveModelSelection, getModelSelection } from '@/lib/api/admin-api';

export interface AIModel {
  id: string;
  name: string;
  provider: 'anthropic';
  inputTokenCost: number;
  outputTokenCost: number;
  maxTokens: number;
  description: string;
  tier: 'standard' | 'premium';
}

export interface ModelSelection {
  featureId: string;
  userId: string;
  modelId: string;
  selectedAt: string;
}

export interface CostEstimate {
  modelId: string;
  specReview: number;
  implementation: number;
  testing: number;
  total: number;
}

interface UseModelSelectionProps {
  featureId: string;
  userId: string;
}

interface UseModelSelectionReturn {
  models: AIModel[];
  selectedModel: AIModel | null;
  costEstimate: CostEstimate | null;
  isLoadingModels: boolean;
  isLoadingSelection: boolean;
  isSaving: boolean;
  error: Error | null;
  selectModel: (modelId: string) => Promise<void>;
  calculateCostEstimate: (modelId: string, complexity: 'simple' | 'medium' | 'complex') => CostEstimate;
}

// Default cost estimates based on feature complexity (in tokens)
const COMPLEXITY_ESTIMATES = {
  simple: { spec: 2000, implementation: 8000, testing: 3000 },
  medium: { spec: 4000, implementation: 15000, testing: 6000 },
  complex: { spec: 8000, implementation: 30000, testing: 12000 }
};

export function useModelSelection({ 
  featureId, 
  userId 
}: UseModelSelectionProps): UseModelSelectionReturn {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);

  // Fetch available AI models
  const {
    data: models = [],
    isLoading: isLoadingModels,
    error: modelsError
  } = useQuery({
    queryKey: ['ai-models'],
    queryFn: getAIModels,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch current model selection for this feature/user
  const {
    data: modelSelection,
    isLoading: isLoadingSelection,
    error: selectionError
  } = useQuery({
    queryKey: ['model-selection', featureId, userId],
    queryFn: () => getModelSelection(featureId, userId),
    enabled: !!featureId && !!userId,
  });

  // Save model selection mutation
  const saveSelectionMutation = useMutation({
    mutationFn: ({ modelId }: { modelId: string }) => 
      saveModelSelection(featureId, userId, modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['model-selection', featureId, userId]
      });
    },
  });

  // Update selected model when selection or models change
  useEffect(() => {
    if (modelSelection && models.length > 0) {
      const model = models.find(m => m.id === modelSelection.modelId);
      setSelectedModel(model || null);
    }
  }, [modelSelection, models]);

  // Calculate cost estimate for a given model and complexity
  const calculateCostEstimate = useCallback((
    modelId: string, 
    complexity: 'simple' | 'medium' | 'complex'
  ): CostEstimate => {
    const model = models.find(m => m.id === modelId);
    if (!model) {
      return { modelId, specReview: 0, implementation: 0, testing: 0, total: 0 };
    }

    const estimates = COMPLEXITY_ESTIMATES[complexity];
    
    // Calculate costs assuming 50/50 input/output token split for estimates
    const calculateStageCost = (tokens: number) => {
      const inputTokens = tokens * 0.5;
      const outputTokens = tokens * 0.5;
      return (inputTokens * model.inputTokenCost) + (outputTokens * model.outputTokenCost);
    };

    const specReview = calculateStageCost(estimates.spec);
    const implementation = calculateStageCost(estimates.implementation);
    const testing = calculateStageCost(estimates.testing);
    const total = specReview + implementation + testing;

    return {
      modelId,
      specReview: Number(specReview.toFixed(4)),
      implementation: Number(implementation.toFixed(4)),
      testing: Number(testing.toFixed(4)),
      total: Number(total.toFixed(4))
    };
  }, [models]);

  // Select model and save to backend
  const selectModel = useCallback(async (modelId: string): Promise<void> => {
    const model = models.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found`);
    }

    setSelectedModel(model);
    
    // Generate cost estimate for medium complexity by default
    const estimate = calculateCostEstimate(modelId, 'medium');
    setCostEstimate(estimate);

    await saveSelectionMutation.mutateAsync({ modelId });
  }, [models, calculateCostEstimate, saveSelectionMutation]);

  // Update cost estimate when selected model changes
  useEffect(() => {
    if (selectedModel) {
      const estimate = calculateCostEstimate(selectedModel.id, 'medium');
      setCostEstimate(estimate);
    } else {
      setCostEstimate(null);
    }
  }, [selectedModel, calculateCostEstimate]);

  const error = modelsError || selectionError || saveSelectionMutation.error;

  return {
    models,
    selectedModel,
    costEstimate,
    isLoadingModels,
    isLoadingSelection,
    isSaving: saveSelectionMutation.isPending,
    error: error || null,
    selectModel,
    calculateCostEstimate
  };
}