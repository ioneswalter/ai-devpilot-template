/**
 * Per-feature pipeline-state verifier.
 *
 * Run as the FINAL step of every pipeline command (\spec, \build, \generate-tests,
 * \fix-spec, \fix-build, \fix-test) so the command cannot declare success while the
 * Roadmap state is half-populated. Exits non-zero if any check fails.
 *
 * Usage:
 *   tsx scripts/verify-feature-state.ts <FR-CODE> --stage spec
 *   tsx scripts/verify-feature-state.ts <FR-CODE> --stage build
 *   tsx scripts/verify-feature-state.ts <FR-CODE> --stage test
 *
 * Each stage runs only the checks relevant to that stage. Pre-existing rows from
 * earlier stages are not re-verified — those were the previous command's job.
 */

import pg from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

type Stage = 'spec' | 'build' | 'test';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function parseArgs(): { code: string; stage: Stage } {
  const args = process.argv.slice(2);
  const code = args.find((a) => /^FR-\d+/i.test(a));
  const stageIdx = args.indexOf('--stage');
  const stage = stageIdx >= 0 ? (args[stageIdx + 1] as Stage) : null;
  if (!code || !stage || !['spec', 'build', 'test'].includes(stage)) {
    console.error('Usage: tsx scripts/verify-feature-state.ts <FR-CODE> --stage spec|build|test');
    process.exit(2);
  }
  return { code: code.toUpperCase(), stage };
}

async function loadFeature(client: pg.Client, code: string) {
  const r = await client.query(
    `SELECT id, feature_code, status, jsonb_array_length(acceptance_criteria) AS criteria_count
       FROM product_features WHERE feature_code = $1`,
    [code]
  );
  if (r.rows.length === 0) throw new Error(`Feature ${code} not found`);
  return r.rows[0] as { id: string; feature_code: string; status: string; criteria_count: number };
}

function findSpecDir(featureCode: string): string | null {
  const num = featureCode.replace(/^FR-/i, '').replace(/^0+/, '');
  const specsRoot = path.join(process.cwd(), 'specs');
  if (!fs.existsSync(specsRoot)) return null;
  const padded = num.padStart(3, '0');
  const dir = fs.readdirSync(specsRoot).find((d) => d.startsWith(`${padded}-`));
  return dir ? path.join(specsRoot, dir) : null;
}

function countTasks(specDir: string): { total: number; completed: number } {
  const tasksMd = path.join(specDir, 'tasks.md');
  if (!fs.existsSync(tasksMd)) return { total: 0, completed: 0 };
  const md = fs.readFileSync(tasksMd, 'utf8');
  const re = /^- \[(.)\] T\d+/gm;
  let total = 0;
  let completed = 0;
  let m;
  while ((m = re.exec(md)) !== null) {
    total++;
    if (m[1] === 'x') completed++;
  }
  return { total, completed };
}

async function checkSpec(client: pg.Client, code: string): Promise<Check[]> {
  const checks: Check[] = [];
  const f = await loadFeature(client, code);

  // Status: spec stage exits with 'reviewed' (pre-approval) or 'specified' (approved).
  checks.push({
    name: 'feature.status',
    ok: ['reviewed', 'specified', 'in_development', 'in_testing', 'released'].includes(f.status),
    detail: `status = '${f.status}'`,
  });

  // Spec directory exists with required artifacts.
  const specDir = findSpecDir(f.feature_code);
  checks.push({
    name: 'spec_dir_exists',
    ok: !!specDir,
    detail: specDir ? `found ${path.basename(specDir)}` : 'no specs/ subdirectory',
  });
  if (specDir) {
    for (const file of [
      'spec.md',
      'plan.md',
      'tasks.md',
      'research.md',
      'data-model.md',
      'quickstart.md',
    ]) {
      const p = path.join(specDir, file);
      checks.push({ name: `spec_file:${file}`, ok: fs.existsSync(p), detail: p });
    }
    const contractsDir = path.join(specDir, 'contracts');
    checks.push({
      name: 'spec_contracts_dir',
      ok: fs.existsSync(contractsDir) && fs.readdirSync(contractsDir).length > 0,
      detail: contractsDir,
    });
  }

  // feature_spec_artifacts row count >= 6 (the canonical artifact types).
  const arts = await client.query(
    `SELECT artifact_type FROM feature_spec_artifacts WHERE feature_id = $1`,
    [f.id]
  );
  const types = new Set(arts.rows.map((r) => r.artifact_type as string));
  for (const t of ['spec', 'plan', 'tasks', 'research', 'data_model', 'quickstart']) {
    checks.push({
      name: `feature_spec_artifacts:${t}`,
      ok: types.has(t),
      detail: types.has(t) ? 'synced' : 'missing — run pnpm sync:specs',
    });
  }

  // spec_reviews row exists (in_review or approved).
  const sr = await client.query(
    `SELECT id, status FROM spec_reviews WHERE feature_id = $1 ORDER BY version DESC LIMIT 1`,
    [f.id]
  );
  checks.push({
    name: 'spec_reviews row',
    ok: sr.rows.length > 0,
    detail: sr.rows.length > 0 ? `status=${sr.rows[0].status}` : 'missing',
  });

  // review_items count == acceptance_criteria count.
  if (sr.rows.length > 0) {
    const ri = await client.query(
      `SELECT COUNT(*)::int AS c FROM review_items WHERE review_id = $1`,
      [sr.rows[0].id]
    );
    const itemCount = ri.rows[0].c as number;
    checks.push({
      name: 'review_items count',
      ok: itemCount === f.criteria_count,
      detail: `${itemCount} items vs ${f.criteria_count} acceptance_criteria`,
    });
  }
  return checks;
}

async function checkBuild(client: pg.Client, code: string): Promise<Check[]> {
  const checks: Check[] = [];
  const f = await loadFeature(client, code);
  const specDir = findSpecDir(f.feature_code);
  if (!specDir) {
    return [{ name: 'spec_dir', ok: false, detail: 'spec directory missing' }];
  }
  const { total: tasksTotal, completed: tasksDone } = countTasks(specDir);

  // implementation_requests exists.
  const ir = await client.query(
    `SELECT id, status, code_applied FROM implementation_requests
      WHERE feature_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [f.id]
  );
  checks.push({
    name: 'implementation_requests row',
    ok: ir.rows.length > 0,
    detail: ir.rows.length > 0 ? `status=${ir.rows[0].status}` : 'missing — run \\build',
  });
  if (ir.rows.length === 0) return checks;
  const requestId = ir.rows[0].id as string;

  // pipeline_runs row exists with task counts matching tasks.md.
  const pr = await client.query(
    `SELECT id, status, total_tasks, completed_tasks FROM pipeline_runs
      WHERE feature_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [f.id]
  );
  checks.push({
    name: 'pipeline_runs row',
    ok: pr.rows.length > 0,
    detail: pr.rows.length > 0 ? `status=${pr.rows[0].status}` : 'missing',
  });
  if (pr.rows.length > 0) {
    checks.push({
      name: 'pipeline_runs.total_tasks matches tasks.md',
      ok: (pr.rows[0].total_tasks as number) === tasksTotal,
      detail: `pipeline_runs=${pr.rows[0].total_tasks} vs tasks.md=${tasksTotal}`,
    });
    checks.push({
      name: 'pipeline_runs.completed_tasks matches checked items',
      ok: (pr.rows[0].completed_tasks as number) === tasksDone,
      detail: `pipeline_runs=${pr.rows[0].completed_tasks} vs tasks.md checked=${tasksDone}`,
    });
  }

  // implementation_task_items count == tasks.md count.
  const tic = await client.query(
    `SELECT COUNT(*)::int AS c FROM implementation_task_items WHERE request_id = $1`,
    [requestId]
  );
  const itemsCount = tic.rows[0].c as number;
  checks.push({
    name: 'implementation_task_items count == tasks.md',
    ok: itemsCount === tasksTotal,
    detail: `${itemsCount} items vs ${tasksTotal} tasks in tasks.md`,
  });

  // Spec review must be approved before build is "complete".
  const sr = await client.query(
    `SELECT status FROM spec_reviews WHERE feature_id = $1 ORDER BY version DESC LIMIT 1`,
    [f.id]
  );
  checks.push({
    name: 'spec_reviews.status = approved',
    ok: sr.rows[0]?.status === 'approved',
    detail: `status=${sr.rows[0]?.status ?? 'missing'}`,
  });

  // Constitution compliance report exists.
  const compReport = path.join(specDir, 'checklists', 'constitution-compliance.md');
  checks.push({
    name: 'constitution-compliance.md exists',
    ok: fs.existsSync(compReport),
    detail: compReport,
  });

  return checks;
}

async function checkTest(client: pg.Client, code: string): Promise<Check[]> {
  const checks: Check[] = [];
  const f = await loadFeature(client, code);

  // test_cases exist.
  const tc = await client.query(
    `SELECT id, test_code, automation_status FROM test_cases WHERE feature_id = $1`,
    [f.id]
  );
  const cases = tc.rows;
  checks.push({
    name: 'test_cases exist',
    ok: cases.length > 0,
    detail: `${cases.length} cases`,
  });

  // Coverage gate: every acceptance criterion mapped (FR-145 v1.1 / FR-028).
  // Approximate: test_cases.length >= criteria_count.
  checks.push({
    name: 'coverage: tests >= criteria',
    ok: cases.length >= f.criteria_count,
    detail: `tests=${cases.length} criteria=${f.criteria_count}`,
  });

  // Execution gate: every test_case has at least one passing test_runs row.
  if (cases.length > 0) {
    const ids = cases.map((r: pg.QueryResultRow) => r.id as string);
    const runs = await client.query(
      `SELECT test_case_id FROM test_runs WHERE test_case_id = ANY($1::text[]) AND result IN ('passed', 'pass')`,
      [ids]
    );
    const passing = new Set(runs.rows.map((r) => r.test_case_id as string));
    const missing = ids.filter((id: string) => !passing.has(id));
    checks.push({
      name: 'every test_case has passing test_runs evidence',
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `${passing.size}/${ids.length} passing`
          : `${missing.length} cases without passing run`,
    });
  }

  // After tests pass, feature should be in_testing or beyond.
  checks.push({
    name: 'feature.status >= in_testing',
    ok: ['in_testing', 'in_acceptance', 'released'].includes(f.status),
    detail: `status=${f.status}`,
  });
  return checks;
}

async function main() {
  const { code, stage } = parseArgs();
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.error('Missing DATABASE_URL in .env.local');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: cs });
  await client.connect();
  let checks: Check[] = [];
  try {
    if (stage === 'spec') checks = await checkSpec(client, code);
    else if (stage === 'build') checks = await checkBuild(client, code);
    else if (stage === 'test') checks = await checkTest(client, code);
  } finally {
    await client.end();
  }

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);
  console.log(`\nverify-feature-state ${code} --stage ${stage}`);
  console.log(`  ${passed}/${checks.length} checks passed`);
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`);
  }
  if (failed.length > 0) {
    console.log(
      `\nFAIL — ${failed.length} check(s) failed. Fix and re-run before declaring ${stage} complete.`
    );
    process.exit(1);
  }
  console.log(`\nPASS — ${stage} stage is fully populated.`);
}

main().catch((e) => {
  console.error('verify-feature-state error:', e instanceof Error ? e.message : e);
  process.exit(2);
});
