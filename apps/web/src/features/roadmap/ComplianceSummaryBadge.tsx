/**
 * ComplianceSummaryBadge — Visual badge showing compliance status.
 * Variants: PASS (green), FAIL (red), BLOCKED (red pulsing), Not scanned (gray).
 */

type BadgeVariant = 'pass' | 'fail' | 'blocked' | 'not-scanned';

interface ComplianceSummaryBadgeProps {
  variant: BadgeVariant;
}

const BADGE_STYLES: Record<BadgeVariant, string> = {
  pass: 'bg-green-100 text-green-700 border-green-200',
  fail: 'bg-red-100 text-red-700 border-red-200',
  blocked: 'bg-red-100 text-red-700 border-red-300 animate-pulse',
  'not-scanned': 'bg-gray-100 text-gray-500 border-gray-200',
};

const BADGE_LABELS: Record<BadgeVariant, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  blocked: 'BLOCKED',
  'not-scanned': 'Not scanned',
};

const BADGE_ICONS: Record<BadgeVariant, string> = {
  pass: '\u2713',
  fail: '\u2717',
  blocked: '\u26D4',
  'not-scanned': '\u2014',
};

export function ComplianceSummaryBadge({ variant }: ComplianceSummaryBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold border rounded-full ${BADGE_STYLES[variant]}`}
      aria-label={`Compliance status: ${BADGE_LABELS[variant]}`}
      role="status"
    >
      <span aria-hidden="true">{BADGE_ICONS[variant]}</span>
      {BADGE_LABELS[variant]}
    </span>
  );
}
