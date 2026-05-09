#!/usr/bin/env npx tsx
/**
 * FR-165 J2 — DevPilot API Readiness Verifier.
 *
 * Counts how many DevPilot Edge Functions wrap their handler with
 * `withApiGateway` from `_shared/api-gateway.ts` (the FR-163 gateway middleware).
 * Compares to a stored baseline; exits non-zero ONLY on regression.
 * Run with `--update-baseline` to bump the baseline after intentionally wrapping a new endpoint.
 *
 * Reads the DevPilot Edge Function path list from docs/repo-split-plan.md.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

interface Baseline {
  wrapped: number;
  total: number;
  last_updated: string;
}

const REPO_ROOT = resolve(process.cwd());
const PLAN_PATH = join(REPO_ROOT, 'docs/repo-split-plan.md');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/lib/devpilot-readiness-baseline.json');
const FUNCTIONS_ROOT = join(REPO_ROOT, 'supabase/functions');
const GATEWAY_IMPORT_RE = /from ['"]\.\.\/_shared\/api-gateway(\.ts)?['"]/;

function loadDevpilotFunctionDirs(): string[] {
  const plan = readFileSync(PLAN_PATH, 'utf-8');
  const dirs = new Set<string>();
  const lineRe = /^\| `(supabase\/functions\/([\w-]+)\/)`/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(plan)) !== null) dirs.add(m[2]);
  return [...dirs].filter((d) => existsSync(join(FUNCTIONS_ROOT, d, 'index.ts')));
}

function isWrapped(dir: string): boolean {
  const indexPath = join(FUNCTIONS_ROOT, dir, 'index.ts');
  const src = readFileSync(indexPath, 'utf-8');
  return GATEWAY_IMPORT_RE.test(src);
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) {
    return { wrapped: 0, total: 0, last_updated: '1970-01-01T00:00:00Z' };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Baseline;
}

function saveBaseline(b: Baseline): void {
  writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + '\n');
}

function main(): void {
  const update = process.argv.includes('--update-baseline');
  const dirs = loadDevpilotFunctionDirs();
  const wrappedDirs = dirs.filter(isWrapped);
  const total = dirs.length;
  const wrapped = wrappedDirs.length;
  const pct = total === 0 ? 0 : Math.round((wrapped / total) * 1000) / 10;

  const baseline = loadBaseline();
  const baselinePct =
    baseline.total === 0 ? 0 : Math.round((baseline.wrapped / baseline.total) * 1000) / 10;

  console.log(`DevPilot API Readiness — ${wrapped}/${total} routes wrapped (${pct}%)`);
  console.log(`Baseline:               ${baseline.wrapped}/${baseline.total} (${baselinePct}%)`);
  console.log('');
  console.log('Wrapped routes:');
  for (const d of wrappedDirs.sort()) console.log(`  ✓ ${d}`);
  console.log('');
  console.log('Unwrapped DevPilot routes (cutover candidates):');
  for (const d of dirs.filter((x) => !wrappedDirs.includes(x)).sort()) console.log(`  ○ ${d}`);

  if (update) {
    const next: Baseline = {
      wrapped,
      total,
      last_updated: new Date().toISOString(),
    };
    saveBaseline(next);
    console.log(`\n✓ Baseline updated → ${wrapped}/${total} (${pct}%)`);
    process.exit(0);
  }

  if (wrapped < baseline.wrapped) {
    console.error(
      `\nREGRESSION: ${wrapped} routes wrapped, baseline expects ≥ ${baseline.wrapped}.`
    );
    console.error(
      'A previously-wrapped route lost its `withApiGateway` import. Restore it, or re-run with --update-baseline if the change was intentional.'
    );
    process.exit(1);
  }

  if (wrapped > baseline.wrapped) {
    console.log(
      `\nNew wrapped routes detected (current ${wrapped} > baseline ${baseline.wrapped}). Run with --update-baseline to record this as the new baseline.`
    );
  } else {
    console.log(`\nPASS — readiness matches baseline (${wrapped}/${total}).`);
  }
}

main();
