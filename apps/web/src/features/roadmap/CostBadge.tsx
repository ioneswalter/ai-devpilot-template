/**
 * Presentational component for displaying AI usage costs with loading states and positioning variants
 */

import { cn } from '@/lib/utils';

interface CostBadgeProps {
  /** Cost in USD, or null for loading state */
  cost?: number | null;
  /** Visual variant for positioning */
  variant?: 'top-right' | 'inline';
  /** Additional CSS classes */
  className?: string;
  /** Whether to show loading state */
  isLoading?: boolean;
  /** Click handler for cost breakdown */
  onClick?: () => void;
}

export function CostBadge({ 
  cost, 
  variant = 'inline', 
  className, 
  isLoading = false,
  onClick 
}: CostBadgeProps) {
  // Show loading state
  if (isLoading) {
    return (
      <div className={cn(
        'animate-pulse bg-gray-200 rounded-full',
        variant === 'top-right' && 'absolute top-2 right-2 w-16 h-6',
        variant === 'inline' && 'w-12 h-4',
        className
      )} />
    );
  }

  // Show nothing if no cost data
  if (cost === null || cost === undefined) {
    return null;
  }

  const formattedCost = cost === 0 
    ? 'Free' 
    : `$${cost.toFixed(cost < 1 ? 3 : 2)}`;

  const baseClasses = cn(
    'inline-flex items-center px-2 py-1 text-xs font-medium rounded-full transition-colors',
    'bg-blue-50 text-blue-700 border border-blue-200',
    onClick && 'cursor-pointer hover:bg-blue-100 hover:border-blue-300',
    variant === 'top-right' && 'absolute top-2 right-2',
    className
  );

  return (
    <span 
      className={baseClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {formattedCost}
    </span>
  );
}