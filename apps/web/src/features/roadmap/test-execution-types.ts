/**
 * Types for FR-106 test execution workflow.
 */

export type TestRunResult = 'passed' | 'failed' | 'skipped';

export interface TestExecutionEntry {
  id: string;
  test_case_id: string;
  test_code: string;
  test_title: string;
  test_type: string;
  result: TestRunResult;
  notes: string | null;
  evidence: Record<string, unknown> | null;
  executed_by: string;
  executed_at: string;
  environment: string;
}

export interface ReleaseReadiness {
  total: number;
  passed: number;
  failed: number;
  notRun: number;
  lastRunAt: string | null;
  isReady: boolean;
}

export interface TestResultInput {
  test_case_id: string;
  result: TestRunResult;
  notes?: string;
  evidence?: Record<string, unknown>;
}
