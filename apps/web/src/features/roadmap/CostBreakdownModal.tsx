/**
 * Modal component for displaying detailed AI usage cost breakdown by operation stage
 */

import React from 'react';
import { X } from 'lucide-react';

export interface CostBreakdownData {
  totalCost: number;
  currency: string;
  breakdown: {
    stage: string;
    operationType: string;
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    timestamp: string;
    status: 'success' | 'failed' | 'partial';
  }[];
  metadata?: {
    featureId: string;
    featureName: string;
    dateRange?: {
      start: string;
      end: string;
    };
  };
}

interface CostBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CostBreakdownData | null;
  title?: string;
}

export function CostBreakdownModal({
  isOpen,
  onClose,
  data,
  title = "Cost Breakdown"
}: CostBreakdownModalProps) {
  if (!isOpen || !data) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: data.currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(amount);
  };

  const formatTokens = (tokens: number) => {
    return new Intl.NumberFormat('en-US').format(tokens);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      'spec-review': 'bg-blue-100 text-blue-800',
      'implementation': 'bg-green-100 text-green-800',
      'testing': 'bg-purple-100 text-purple-800',
      'code-review': 'bg-orange-100 text-orange-800',
      'documentation': 'bg-gray-100 text-gray-800'
    };
    return colors[stage] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'success': 'text-green-600',
      'failed': 'text-red-600',
      'partial': 'text-yellow-600'
    };
    return colors[status] || 'text-gray-600';
  };

  const stageTotals = data.breakdown.reduce((acc, item) => {
    if (!acc[item.stage]) {
      acc[item.stage] = { cost: 0, count: 0 };
    }
    acc[item.stage].cost += item.cost;
    acc[item.stage].count += 1;
    return acc;
  }, {} as Record<string, { cost: number; count: number }>);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            {data.metadata?.featureName && (
              <p className="text-sm text-gray-600 mt-1">
                Feature: {data.metadata.featureName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Summary Section */}
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">Total Cost</h3>
                <span className="text-xl font-semibold text-blue-600">
                  {formatCurrency(data.totalCost)}
                </span>
              </div>
              
              {/* Stage Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(stageTotals).map(([stage, totals]) => (
                  <div key={stage} className="text-sm">
                    <div className="flex justify-between">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStageColor(stage)}`}>
                        {stage}
                      </span>
                      <span className="font-medium">{formatCurrency(totals.cost)}</span>
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      {totals.count} operation{totals.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Breakdown Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Stage</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Operation</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Model</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Input Tokens</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Output Tokens</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Cost</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Date</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.breakdown.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStageColor(item.stage)}`}>
                        {item.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.operationType}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.modelUsed}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatTokens(item.inputTokens)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatTokens(item.outputTokens)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(item.cost)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(item.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium capitalize ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.breakdown.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No usage data available for this breakdown.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}