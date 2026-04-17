/**
 * Shared types for AI-Powered Test Automation (FR-109 v2)
 * Two-tier: API verification tests + hardened browser extension E2E tests
 *
 * Split into sub-modules:
 *   - automation-script-types.ts — script steps, automated test scripts, ScriptListItem
 *   - automation-test-types.ts — API verification, guidance, recommendations, coverage
 *   - automation-response-types.ts — API response types, gate warnings, v1 compat
 */

// Script step types and automated test script interfaces
export type {
  ScriptAction,
  TargetStrategy,
  WaitCondition,
  ScriptTarget,
  ScriptStep,
  GenerationSource,
  ScriptRunResult,
  AutomationStatus,
  TestTier,
  RetryConfig,
  AutomatedTestScript,
  ScriptListItem,
} from './automation-script-types';

// API verification, failure guidance, recommendations, visual, coverage
export type {
  ApiTestAssertions,
  ApiTestNegativeCase,
  ApiVerificationTest,
  GuidanceSeverity,
  GuidanceCategory,
  LikelySource,
  FailureGuidance,
  GuidanceGroup,
  RecommendationCategory,
  ImprovementRecommendation,
  VisualAssessment,
  VisualCheckpoint,
  TrendPoint,
  AutomationCoverage,
} from './automation-test-types';

// API response types, gate warnings, v1 compat
export type {
  GenerateScriptsResult,
  ApiTestResult,
  ExecuteScriptResult,
  TierResults,
  ExecuteSuiteResult,
  StalenessResult,
  GuidanceListResult,
  RecommendationListResult,
  GateType,
  GateLevel,
  GateWarning,
  GateWarningDismissal,
  GateWarningState,
  VisualAssertResult,
  ConvertManualResult,
} from './automation-response-types';
