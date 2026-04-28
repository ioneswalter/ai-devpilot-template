/**
 * TypeScript types for the Constitutional Compliance API (FR-138).
 * Matches the response schema from validate-constitution Edge Function.
 */

export type RuleType =
  | 'FILE_SIZE'
  | 'FUNCTION_SIZE'
  | 'ANY_TYPE'
  | 'RLS_MISSING'
  | 'CONSOLE_LOG'
  | 'TS_IGNORE'
  | 'ESLINT_DISABLE'
  | 'SECRET_LEAK'
  | 'DEAD_IMPORT'
  | 'MISSING_ERROR_HANDLING'
  | 'MISSING_ZOD_VALIDATION';

export interface Violation {
  rule: RuleType;
  file_path: string;
  line: number | null;
  detail: string;
  actual: number | string;
  limit: number | string;
}

export interface FileResult {
  path: string;
  status: 'pass' | 'fail' | 'error';
  violations: Violation[];
  error: string | null;
}

export interface ComplianceReport {
  status: 'PASS' | 'FAIL';
  total_files: number;
  compliant_files: number;
  total_violations: number;
  files: FileResult[];
}

/** Rule metadata for UI display */
export const RULE_LABELS: Record<
  RuleType,
  { label: string; severity: 'critical' | 'high' | 'medium' }
> = {
  FILE_SIZE: { label: 'File Size', severity: 'high' },
  FUNCTION_SIZE: { label: 'Function Size', severity: 'high' },
  ANY_TYPE: { label: 'Any Type', severity: 'critical' },
  RLS_MISSING: { label: 'RLS Missing', severity: 'critical' },
  CONSOLE_LOG: { label: 'Console Log', severity: 'medium' },
  TS_IGNORE: { label: 'TS Ignore', severity: 'high' },
  ESLINT_DISABLE: { label: 'ESLint Disable', severity: 'high' },
  SECRET_LEAK: { label: 'Secret Leak', severity: 'critical' },
  DEAD_IMPORT: { label: 'Dead Import', severity: 'medium' },
  MISSING_ERROR_HANDLING: { label: 'Missing Error Handling', severity: 'high' },
  MISSING_ZOD_VALIDATION: { label: 'Missing Zod Validation', severity: 'high' },
};
