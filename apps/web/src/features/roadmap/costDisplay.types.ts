/**
 * Types and utilities for displaying AI usage costs in the roadmap feature.
 * Handles cost formatting, badge positioning, and display logic.
 */

// Core cost display data structure
export interface CostDisplayData {
  totalCost: number;
  currency: 'USD';
  formattedAmount: string;
  breakdown?: CostBreakdown;
  hasUsage: boolean;
  lastUpdated?: string;
}

// Detailed cost breakdown by operation stage
export interface CostBreakdown {
  specReview: number;
  implementation: number;
  testing: number;
  codeGeneration: number;
  errorFixing: number;
  other: number;
}

// Cost badge positioning and styling options
export enum CostBadgePosition {
  TOP_RIGHT = 'top-right',
  TOP_LEFT = 'top-left',
  BOTTOM_RIGHT = 'bottom-right',
  BOTTOM_LEFT = 'bottom-left',
  INLINE = 'inline'
}

export enum CostDisplaySize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large'
}

export enum CostThresholdLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Cost display configuration
export interface CostDisplayConfig {
  position: CostBadgePosition;
  size: CostDisplaySize;
  showBreakdown: boolean;
  thresholdWarnings: boolean;
  compactMode: boolean;
}

// Usage data for transformation
export interface RawUsageData {
  id: string;
  featureId: string;
  operationType: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  cost: number;
  createdAt: string;
  stage: string;
}

// Aggregated usage summary
export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  operationCount: number;
  modelBreakdown: Record<string, number>;
  stageBreakdown: Record<string, number>;
  timeRange: {
    start: string;
    end: string;
  };
}

// Cost formatting utilities
export function formatCostAmount(amount: number, precision: number = 2): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(precision)}`;
}

export function formatCompactCost(amount: number): string {
  if (amount === 0) return '$0';
  if (amount < 0.01) return '<$0.01';
  if (amount < 1) return `$${amount.toFixed(2)}`;
  if (amount < 10) return `$${amount.toFixed(1)}`;
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${Math.round(amount)}`;
}

// Cost threshold determination
export function getCostThresholdLevel(amount: number): CostThresholdLevel {
  if (amount === 0) return CostThresholdLevel.LOW;
  if (amount < 5) return CostThresholdLevel.LOW;
  if (amount < 25) return CostThresholdLevel.MEDIUM;
  if (amount < 100) return CostThresholdLevel.HIGH;
  return CostThresholdLevel.CRITICAL;
}

// Display logic helpers
export function shouldShowCostIndicator(usageData: RawUsageData[]): boolean {
  return usageData.length > 0 && usageData.some(usage => usage.cost > 0);
}

export function shouldShowCostWarning(amount: number, threshold: number = 50): boolean {
  return amount >= threshold;
}

export function shouldUseCompactDisplay(amount: number, containerWidth?: number): boolean {
  if (containerWidth && containerWidth < 150) return true;
  return amount >= 1000;
}

// Data transformation utilities
export function transformUsageDataToCostDisplay(
  usageData: RawUsageData[]
): CostDisplayData {
  if (!usageData || usageData.length === 0) {
    return {
      totalCost: 0,
      currency: 'USD',
      formattedAmount: '$0.00',
      hasUsage: false
    };
  }

  const totalCost = usageData.reduce((sum, usage) => sum + usage.cost, 0);
  const breakdown = calculateCostBreakdown(usageData);
  const lastUpdated = Math.max(...usageData.map(u => new Date(u.createdAt).getTime()));

  return {
    totalCost,
    currency: 'USD',
    formattedAmount: formatCostAmount(totalCost),
    breakdown,
    hasUsage: true,
    lastUpdated: new Date(lastUpdated).toISOString()
  };
}

export function calculateCostBreakdown(usageData: RawUsageData[]): CostBreakdown {
  const breakdown: CostBreakdown = {
    specReview: 0,
    implementation: 0,
    testing: 0,
    codeGeneration: 0,
    errorFixing: 0,
    other: 0
  };

  usageData.forEach(usage => {
    const stage = usage.stage?.toLowerCase() || usage.operationType?.toLowerCase() || 'other';
    
    if (stage.includes('spec') || stage.includes('review')) {
      breakdown.specReview += usage.cost;
    } else if (stage.includes('implement') || stage.includes('planning')) {
      breakdown.implementation += usage.cost;
    } else if (stage.includes('test')) {
      breakdown.testing += usage.cost;
    } else if (stage.includes('code') || stage.includes('generation')) {
      breakdown.codeGeneration += usage.cost;
    } else if (stage.includes('error') || stage.includes('fix')) {
      breakdown.errorFixing += usage.cost;
    } else {
      breakdown.other += usage.cost;
    }
  });

  return breakdown;
}

// Aggregation utilities
export function aggregateUsageByTimeRange(
  usageData: RawUsageData[],
  startDate: string,
  endDate: string
): UsageSummary {
  const filtered = usageData.filter(usage => {
    const usageDate = new Date(usage.createdAt);
    return usageDate >= new Date(startDate) && usageDate <= new Date(endDate);
  });

  const totalCost = filtered.reduce((sum, usage) => sum + usage.cost, 0);
  const totalTokens = filtered.reduce((sum, usage) => sum + usage.inputTokens + usage.outputTokens, 0);

  const modelBreakdown: Record<string, number> = {};
  const stageBreakdown: Record<string, number> = {};

  filtered.forEach(usage => {
    modelBreakdown[usage.model] = (modelBreakdown[usage.model] || 0) + usage.cost;
    stageBreakdown[usage.stage] = (stageBreakdown[usage.stage] || 0) + usage.cost;
  });

  return {
    totalCost,
    totalTokens,
    operationCount: filtered.length,
    modelBreakdown,
    stageBreakdown,
    timeRange: {
      start: startDate,
      end: endDate
    }
  };
}

// CSS class helpers for styling
export function getCostBadgeClasses(
  position: CostBadgePosition,
  size: CostDisplaySize,
  thresholdLevel: CostThresholdLevel
): string {
  const baseClasses = 'inline-flex items-center rounded-full font-medium';
  
  const positionClasses = {
    [CostBadgePosition.TOP_RIGHT]: 'absolute top-2 right-2',
    [CostBadgePosition.TOP_LEFT]: 'absolute top-2 left-2',
    [CostBadgePosition.BOTTOM_RIGHT]: 'absolute bottom-2 right-2',
    [CostBadgePosition.BOTTOM_LEFT]: 'absolute bottom-2 left-2',
    [CostBadgePosition.INLINE]: 'relative'
  };

  const sizeClasses = {
    [CostDisplaySize.SMALL]: 'px-2 py-1 text-xs',
    [CostDisplaySize.MEDIUM]: 'px-2.5 py-1.5 text-sm',
    [CostDisplaySize.LARGE]: 'px-3 py-2 text-base'
  };

  const thresholdClasses = {
    [CostThresholdLevel.LOW]: 'bg-green-100 text-green-800',
    [CostThresholdLevel.MEDIUM]: 'bg-yellow-100 text-yellow-800',
    [CostThresholdLevel.HIGH]: 'bg-orange-100 text-orange-800',
    [CostThresholdLevel.CRITICAL]: 'bg-red-100 text-red-800'
  };

  return [
    baseClasses,
    positionClasses[position],
    sizeClasses[size],
    thresholdClasses[thresholdLevel]
  ].join(' ');
}

// Default configuration
export const DEFAULT_COST_DISPLAY_CONFIG: CostDisplayConfig = {
  position: CostBadgePosition.TOP_RIGHT,
  size: CostDisplaySize.SMALL,
  showBreakdown: false,
  thresholdWarnings: true,
  compactMode: false
};