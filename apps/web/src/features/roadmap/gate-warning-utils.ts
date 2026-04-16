/**
 * Gate Warning Utilities (FR-145)
 * Parse generation_notes for [GATE:...] prefixes and manage dismissal state.
 */

import type { GateWarning, GateLevel, GateType, GateWarningState } from './automation-types';

const GATE_PATTERN = /\[GATE:(PASS|WARN|FAIL|FIX)(?::(\w+))?\]\s*(.+)/;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Parse generation_notes text into structured gate warnings.
 * Returns empty array if no gate prefixes found.
 */
export function parseGateWarnings(generationNotes: string | null): GateWarning[] {
  if (!generationNotes) return [];

  const lines = generationNotes.split('\n');
  const warnings: GateWarning[] = [];

  for (const line of lines) {
    const match = line.match(GATE_PATTERN);
    if (match) {
      warnings.push({
        level: match[1] as GateLevel,
        type: (match[2] ?? 'schema') as GateType,
        message: match[3].trim(),
      });
    }
  }

  return warnings;
}

/**
 * Check if a script has any actionable gate warnings (WARN level).
 */
export function hasGateWarnings(generationNotes: string | null): boolean {
  if (!generationNotes) return false;
  return generationNotes.includes('[GATE:WARN:');
}

/**
 * Get the sessionStorage key for gate warning dismissals.
 */
function getStorageKey(featureId: string): string {
  return `gate-warnings-${featureId}`;
}

/**
 * Load dismissed gate warnings from sessionStorage.
 */
export function loadDismissedWarnings(featureId: string): GateWarningState {
  try {
    const raw = sessionStorage.getItem(getStorageKey(featureId));
    if (!raw) return {};
    const state = JSON.parse(raw) as GateWarningState & { savedAt?: string };
    // Check TTL
    if (state.savedAt) {
      const savedAt = new Date(state.savedAt).getTime();
      if (Date.now() - savedAt > SESSION_TTL_MS) {
        sessionStorage.removeItem(getStorageKey(featureId));
        return {};
      }
    }
    return state;
  } catch {
    return {};
  }
}

/**
 * Dismiss a gate warning for a specific script.
 */
export function dismissGateWarning(
  featureId: string,
  scriptId: string,
): void {
  const current = loadDismissedWarnings(featureId);
  current[scriptId] = {
    dismissed: true,
    dismissedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(
    getStorageKey(featureId),
    JSON.stringify({ ...current, savedAt: new Date().toISOString() }),
  );
}

/**
 * Check if a gate warning has been dismissed for a specific script.
 */
export function isWarningDismissed(
  featureId: string,
  scriptId: string,
): boolean {
  const state = loadDismissedWarnings(featureId);
  return state[scriptId]?.dismissed === true;
}
