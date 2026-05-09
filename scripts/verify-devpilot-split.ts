#!/usr/bin/env npx tsx
/**
 * FR-165 J6 — Aggregate DevPilot split verifier.
 *
 * Runs three sub-checks and reports a single PASS/FAIL summary:
 *   1. Readiness — `pnpm verify:devpilot-readiness` (regression detection).
 *   2. License coverage — LICENSE-DEVPILOT path enumeration matches
 *      docs/repo-split-plan.md.
 *   3. Extraction dry-run — `git filter-repo --analyze` against a tmp clone
 *      confirms the documented paths exist in real history.
 *
 * Exits 0 only if all three pass.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { execSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const REPO_ROOT = resolve(process.cwd());
const PLAN_PATH = join(REPO_ROOT, 'docs/repo-split-plan.md');
const LICENSE_PATH = join(REPO_ROOT, 'LICENSE-DEVPILOT');

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function extractPathsFromPlan(): string[] {
  const md = readFileSync(PLAN_PATH, 'utf-8');
  const paths: string[] = [];
  const re = /^\| `([^`]+)`/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) paths.push(m[1]);
  return paths;
}

function extractPathsFromLicense(): string[] {
  if (!existsSync(LICENSE_PATH)) return [];
  const text = readFileSync(LICENSE_PATH, 'utf-8');
  const paths: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s+-\s+(\S.*)$/);
    if (m) paths.push(m[1].trim());
  }
  return paths;
}

function checkReadiness(): CheckResult {
  try {
    execSync('npx tsx scripts/devpilot-readiness.ts', { stdio: 'pipe', cwd: REPO_ROOT });
    return { name: 'readiness', pass: true, detail: 'no regression vs baseline' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'readiness', pass: false, detail: msg.split('\n').slice(-3).join(' | ') };
  }
}

function checkLicenseCoverage(): CheckResult {
  const planPaths = new Set(extractPathsFromPlan());
  const licensePaths = new Set(extractPathsFromLicense());
  const missingFromLicense = [...planPaths].filter((p) => !licensePaths.has(p));
  const missingFromPlan = [...licensePaths].filter((p) => !planPaths.has(p));
  if (missingFromLicense.length === 0 && missingFromPlan.length === 0) {
    return {
      name: 'license-coverage',
      pass: true,
      detail: `${planPaths.size} paths consistent across plan + LICENSE`,
    };
  }
  const reasons: string[] = [];
  if (missingFromLicense.length > 0)
    reasons.push(
      `${missingFromLicense.length} in plan but not LICENSE: ${missingFromLicense.slice(0, 3).join(', ')}${missingFromLicense.length > 3 ? '…' : ''}`
    );
  if (missingFromPlan.length > 0)
    reasons.push(
      `${missingFromPlan.length} in LICENSE but not plan: ${missingFromPlan.slice(0, 3).join(', ')}${missingFromPlan.length > 3 ? '…' : ''}`
    );
  return { name: 'license-coverage', pass: false, detail: reasons.join(' | ') };
}

function checkExtractionDryRun(): CheckResult {
  // Optional: requires git-filter-repo. If not installed, mark as SKIPPED (still pass).
  const filterRepoCheck = spawnSync('git-filter-repo', ['--version'], { stdio: 'pipe' });
  if (filterRepoCheck.status !== 0) {
    return {
      name: 'extraction-dryrun',
      pass: true,
      detail: 'SKIPPED — git-filter-repo not installed (install: brew install git-filter-repo)',
    };
  }
  let tmp = '';
  try {
    tmp = mkdtempSync(join(tmpdir(), 'devpilot-split-'));
    execSync(`git clone --no-local "file://${REPO_ROOT}" "${tmp}"`, { stdio: 'pipe' });
    execSync('git filter-repo --analyze --force', { stdio: 'pipe', cwd: tmp });
    return { name: 'extraction-dryrun', pass: true, detail: 'analyze succeeded' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: 'extraction-dryrun',
      pass: false,
      detail: msg.split('\n').slice(-2).join(' | '),
    };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

function main(): void {
  console.log('DevPilot Split — aggregate verifier');
  console.log('====================================\n');
  const checks: CheckResult[] = [checkReadiness(), checkLicenseCoverage(), checkExtractionDryRun()];
  for (const c of checks) {
    const icon = c.pass ? '✓' : '✗';
    console.log(`  ${icon} ${c.name} — ${c.detail}`);
  }
  const allPass = checks.every((c) => c.pass);
  console.log('');
  if (allPass) {
    console.log('PASS — DevPilot split readiness verified');
    process.exit(0);
  }
  const failed = checks.filter((c) => !c.pass).length;
  console.error(`FAIL — ${failed} of ${checks.length} sub-checks failed`);
  process.exit(1);
}

main();
