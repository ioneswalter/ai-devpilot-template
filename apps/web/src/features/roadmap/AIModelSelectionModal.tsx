/**
 * AIModelSelectionModal - Modal component for selecting AI models with cost estimation
 */

import React, { useState, useEffect } from 'react';

interface AIModel {
  id: string;
  name: string;
  description: string;
  costPerInputToken: number;
  costPerOutputToken: number;
  category: 'premium' | 'balanced' | 'fast';
}

interface CostEstimate {
  specGeneration: number;
  codeReview: number;
  testCreation: number;
  total: number;
}

interface OperationTokenEstimates {
  specGeneration: { input: number; output: number };
  codeReview: { input: number; output: number };
  testCreation: { input: number; output: number };
}

interface AIModelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (modelId: string) => void;
  featureComplexity?: 'simple' | 'medium' | 'complex';
  preselectedModelId?: string;
  isLoading?: boolean;
}

const DEFAULT_MODELS: AIModel[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Premium model with superior reasoning and code generation',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    category: 'premium'
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    description: 'Fast, cost-effective model for routine tasks',
    costPerInputToken: 0.00000025,
    costPerOutputToken: 0.00000125,
    category: 'fast'
  }
];

const BASE_TOKEN_ESTIMATES: Record<string, OperationTokenEstimates> = {
  simple: {
    specGeneration: { input: 2000, output: 1500 },
    codeReview: { input: 1500, output: 800 },
    testCreation: { input: 1000, output: 600 }
  },
  medium: {
    specGeneration: { input: 3500, output: 2500 },
    codeReview: { input: 2500, output: 1200 },
    testCreation: { input: 1800, output: 1000 }
  },
  complex: {
    specGeneration: { input: 5000, output: 3500 },
    codeReview: { input: 4000, output: 2000 },
    testCreation: { input: 3000, output: 1500 }
  }
};

export function AIModelSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  featureComplexity = 'medium',
  preselectedModelId,
  isLoading = false
}: AIModelSelectionModalProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>(
    preselectedModelId || DEFAULT_MODELS[0].id
  );
  const [models, setModels] = useState<AIModel[]>(DEFAULT_MODELS);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (preselectedModelId) {
      setSelectedModelId(preselectedModelId);
    }
  }, [preselectedModelId]);

  useEffect(() => {
    // In a real implementation, this would fetch from the API
    // For now, using default models
    setLoadingModels(false);
  }, []);

  const calculateCostEstimate = (model: AIModel): CostEstimate => {
    const tokenEstimates = BASE_TOKEN_ESTIMATES[featureComplexity];
    
    const specGeneration = 
      (tokenEstimates.specGeneration.input * model.costPerInputToken) +
      (tokenEstimates.specGeneration.output * model.costPerOutputToken);
    
    const codeReview = 
      (tokenEstimates.codeReview.input * model.costPerInputToken) +
      (tokenEstimates.codeReview.output * model.costPerOutputToken);
    
    const testCreation = 
      (tokenEstimates.testCreation.input * model.costPerInputToken) +
      (tokenEstimates.testCreation.output * model.costPerOutputToken);
    
    const total = specGeneration + codeReview + testCreation;

    return {
      specGeneration,
      codeReview,
      testCreation,
      total
    };
  };

  const selectedModel = models.find(m => m.id === selectedModelId);
  const costEstimate = selectedModel ? calculateCostEstimate(selectedModel) : null;

  const handleConfirm = () => {
    if (selectedModelId && !isLoading) {
      onConfirm(selectedModelId);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Select AI Model
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Choose an AI model for this feature ({featureComplexity} complexity)
          </p>
        </div>

        <div className="px-6 py-4">
          {loadingModels ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading models...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {models.map((model) => {
                const estimate = calculateCostEstimate(model);
                const isSelected = model.id === selectedModelId;
                
                return (
                  <div
                    key={model.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedModelId(model.id)}
                  >
                    <div className="flex items-start">
                      <input
                        type="radio"
                        name="model"
                        value={model.id}
                        checked={isSelected}
                        onChange={() => setSelectedModelId(model.id)}
                        className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        disabled={isLoading}
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              {model.name}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {model.description}
                            </p>
                            <div className="flex items-center mt-2">
                              <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                model.category === 'premium'
                                  ? 'bg-purple-100 text-purple-800'
                                  : model.category === 'balanced'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {model.category === 'premium' ? 'Premium' : 
                                 model.category === 'balanced' ? 'Balanced' : 'Fast'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold text-gray-900">
                              {formatCurrency(estimate.total)}
                            </div>
                            <div className="text-xs text-gray-500">
                              estimated cost
                            </div>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">
                              Cost Breakdown
                            </h4>
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <div className="text-gray-600">Spec Generation</div>
                                <div className="font-medium">
                                  {formatCurrency(estimate.specGeneration)}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-600">Code Review</div>
                                <div className="font-medium">
                                  {formatCurrency(estimate.codeReview)}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-600">Test Creation</div>
                                <div className="font-medium">
                                  {formatCurrency(estimate.testCreation)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || !selectedModelId}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            )}
            {isLoading ? 'Confirming...' : 'Confirm Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}