/**
 * CI Check: AI-based code validation with auto-fix loop (FR-114)
 * Runs TypeScript, ESLint, and test validation via Claude AI
 * Up to 3 fix attempts per stage before marking as failed
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';
import { runDeploy } from './deploy.ts';
import { captureFailure } from './failure-capture.ts';

const MAX_FIX_ATTEMPTS = 3;
const AI_MODEL = 'claude-sonnet-4-20250514';

type CIStage = 'typecheck' | 'lint' | 'test';

interface CIAttempt {
  errors: Array<{ file: string; line: number; message: string; code: string }>;
  fix_applied: boolean;
  fixed_files?: string[];
  timestamp: string;
}

interface CIStageResult {
  passed: boolean;
  attempts: CIAttempt[];
}

interface CIResults {
  typecheck: CIStageResult;
  lint: CIStageResult;
  test: CIStageResult;
}

interface GeneratedFile {
  file_path: string;
  code: string;
  task_title: string;
}

const STAGE_LABELS: Record<CIStage, string> = {
  typecheck: 'TypeScript',
  lint: 'ESLint',
  test: 'Vitest',
};

const VALIDATION_PROMPTS: Record<CIStage, string> = {
  typecheck: `Validate the TypeScript code for type safety issues:
- Check for missing or incorrect imports
- Check for type mismatches, missing properties, or wrong argument types
- Check for undefined variables or functions
- Check for incorrect generic type parameters
- Check that JSX props match component interfaces
- Check that async/await is used correctly

If the code is valid, respond with: PASS
If there are errors, respond with a JSON array:
[{"file":"path","line":1,"code":"TS2345","message":"Type 'string' is not assignable to type 'number'"}]`,

  lint: `Validate the code against common ESLint rules:
- React hooks must follow rules-of-hooks (no conditional hooks)
- useEffect/useCallback must list all dependencies
- No unused variables or imports
- Prefer const over let when value isn't reassigned
- No any types (use proper types)
- Components in .tsx files should be the only exports

If the code is valid, respond with: PASS
If there are violations, respond with a JSON array:
[{"file":"path","line":1,"code":"react-hooks/exhaustive-deps","message":"Missing dependency 'x' in deps array"}]`,

  test: `Validate the test code for correctness:
- Check test assertions match the implementation logic
- Check mocks are properly set up for dependencies
- Check async tests use proper await/act() patterns
- Check import paths match actual exports
- Check test descriptions match what is being tested

If the tests are valid, respond with: PASS
If there are issues, respond with a JSON array:
[{"file":"path","line":1,"code":"test-logic","message":"Assertion expects 'foo' but implementation returns 'bar'"}]`,
};

const FIX_PROMPT = `You are a senior TypeScript engineer fixing code issues.

Rules:
- Return ONLY a JSON array of fixed files
- Each entry: {"path":"...","code":"...full corrected file...","changes":"brief description"}
- Only include files that need changes
- Do NOT change functionality — only fix the reported issues
- Keep files under 300 lines (test files up to 500)
- Return valid JSON only, no markdown`;

/**
 * Run full CI validation on pipeline's generated code
 * Called after all code generation tasks are complete
 */
export async function runCICheck(pipelineId: string, requestId: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    await appendLog(supabase, pipelineId, 'error', 'ANTHROPIC_API_KEY not set — skipping CI');
    await completePipeline(supabase, pipelineId, requestId, null);
    return;
  }

  // Update pipeline to build_check stage
  await supabase
    .from('pipeline_runs')
    .update({ current_stage: 'build_check', last_heartbeat: new Date().toISOString() })
    .eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'info', 'Starting CI validation: TypeScript → ESLint → Tests');

  // Collect all generated code
  const { data: tasks } = await supabase
    .from('implementation_task_items')
    .select('file_path, generated_code, title')
    .eq('request_id', requestId)
    .eq('implementation_status', 'completed')
    .not('generated_code', 'is', null);

  if (!tasks || tasks.length === 0) {
    await appendLog(supabase, pipelineId, 'warn', 'No generated code to validate');
    await completePipeline(supabase, pipelineId, requestId, null);
    return;
  }

  const files: GeneratedFile[] = tasks.map(t => ({
    file_path: t.file_path,
    code: t.generated_code!,
    task_title: t.title,
  }));

  // Get feature context for validation
  const { data: pipeline } = await supabase
    .from('pipeline_runs')
    .select('feature_id')
    .eq('id', pipelineId)
    .single();

  const { data: feature } = await supabase
    .from('product_features')
    .select('title, description, acceptance_criteria')
    .eq('id', pipeline?.feature_id)
    .single();

  const anthropic = new Anthropic({ apiKey });
  const ciResults: CIResults = {
    typecheck: { passed: false, attempts: [] },
    lint: { passed: false, attempts: [] },
    test: { passed: false, attempts: [] },
  };

  const stages: CIStage[] = ['typecheck', 'lint', 'test'];
  let allPassed = true;

  for (const stage of stages) {
    // Check if pipeline was cancelled
    const { data: pipelineCheck } = await supabase
      .from('pipeline_runs')
      .select('status')
      .eq('id', pipelineId)
      .single();
    if (pipelineCheck?.status !== 'running') {
      await appendLog(supabase, pipelineId, 'warn', 'Pipeline cancelled during CI');
      return;
    }

    await appendLog(supabase, pipelineId, 'info', `Running ${STAGE_LABELS[stage]} validation...`);
    await supabase
      .from('pipeline_runs')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', pipelineId);

    let stagePassed = false;

    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
      const errors = await validateStage(anthropic, stage, files, feature);

      if (errors.length === 0) {
        stagePassed = true;
        ciResults[stage].attempts.push({
          errors: [],
          fix_applied: false,
          timestamp: new Date().toISOString(),
        });
        await appendLog(supabase, pipelineId, 'info', `${STAGE_LABELS[stage]} passed`);
        break;
      }

      await appendLog(
        supabase, pipelineId,
        attempt < MAX_FIX_ATTEMPTS - 1 ? 'warn' : 'error',
        `${STAGE_LABELS[stage]}: ${errors.length} issue(s) found (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS})`,
      );

      if (attempt < MAX_FIX_ATTEMPTS - 1) {
        // Try to fix
        const fixes = await fixErrors(anthropic, stage, errors, files);
        const fixedPaths: string[] = [];

        if (fixes && fixes.length > 0) {
          for (const fix of fixes) {
            const fileIdx = files.findIndex(f => f.file_path === fix.path);
            if (fileIdx >= 0) {
              files[fileIdx].code = fix.code;
              fixedPaths.push(fix.path);
            }
          }

          // Update generated_code in DB with fixes
          for (const fix of fixes) {
            await supabase
              .from('implementation_task_items')
              .update({ generated_code: fix.code, updated_at: new Date().toISOString() })
              .eq('request_id', requestId)
              .eq('file_path', fix.path);
          }

          await appendLog(supabase, pipelineId, 'info', `Applied fixes to ${fixedPaths.length} file(s)`);
        }

        ciResults[stage].attempts.push({
          errors,
          fix_applied: fixedPaths.length > 0,
          fixed_files: fixedPaths.length > 0 ? fixedPaths : undefined,
          timestamp: new Date().toISOString(),
        });
      } else {
        ciResults[stage].attempts.push({
          errors,
          fix_applied: false,
          timestamp: new Date().toISOString(),
        });
      }

      await supabase
        .from('pipeline_runs')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', pipelineId);
    }

    ciResults[stage].passed = stagePassed;
    if (!stagePassed) {
      allPassed = false;
      await appendLog(supabase, pipelineId, 'error', `${STAGE_LABELS[stage]} failed after ${MAX_FIX_ATTEMPTS} attempts`);
      // FR-118: Capture CI failure for learning
      const lastErrors = ciResults[stage].attempts[ciResults[stage].attempts.length - 1]?.errors ?? [];
      for (const err of lastErrors.slice(0, 3)) {
        captureFailure({ pipeline_id: pipelineId, feature_id: pipeline?.feature_id ?? '', error_type: `ci_${stage}` as 'ci_typecheck' | 'ci_lint' | 'ci_test', error_code: err.code || stage, error_message: err.message, file_path: err.file }).catch(() => {});
      }
    }
  }

  // Save CI results and complete pipeline
  await supabase
    .from('pipeline_runs')
    .update({ ci_results: ciResults })
    .eq('id', pipelineId);

  await completePipeline(supabase, pipelineId, requestId, allPassed);
}

async function validateStage(
  anthropic: Anthropic,
  stage: CIStage,
  files: GeneratedFile[],
  feature: { title: string; description: string; acceptance_criteria: string[] } | null,
): Promise<Array<{ file: string; line: number; message: string; code: string }>> {
  const filesContext = files
    .map(f => `### ${f.file_path}\n\`\`\`typescript\n${f.code}\n\`\`\``)
    .join('\n\n');

  const featureContext = feature
    ? `Feature: ${feature.title}\nDescription: ${feature.description}\nCriteria: ${(feature.acceptance_criteria || []).join('; ')}`
    : '';

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 8192,
        system: `You are validating generated code. ${VALIDATION_PROMPTS[stage]}`,
        messages: [{
          role: 'user',
          content: `${featureContext}\n\n## Generated Code Files\n\n${filesContext}\n\nValidate all files for ${STAGE_LABELS[stage]} issues. Respond with PASS or a JSON error array.`,
        }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CI validation timeout')), 90000)
      ),
    ]);

    const text = response.content.find((b: { type: string }) => b.type === 'text');
    if (!text || text.type !== 'text') return [];

    const content = text.text.trim();
    if (content === 'PASS' || content.toUpperCase().startsWith('PASS')) return [];

    return parseErrors(content);
  } catch (error) {
    console.error(`CI ${stage} validation error:`, error);
    return [{ file: '', line: 0, code: stage, message: `Validation error: ${(error as Error).message}` }];
  }
}

async function fixErrors(
  anthropic: Anthropic,
  stage: CIStage,
  errors: Array<{ file: string; line: number; message: string; code: string }>,
  files: GeneratedFile[],
): Promise<Array<{ path: string; code: string; changes: string }> | null> {
  const errorList = errors.map(e => `- ${e.file}:${e.line} [${e.code}] ${e.message}`).join('\n');
  const filesContext = files
    .map(f => `### ${f.file_path}\n\`\`\`typescript\n${f.code}\n\`\`\``)
    .join('\n\n');

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 16384,
        system: FIX_PROMPT,
        messages: [{
          role: 'user',
          content: `## ${STAGE_LABELS[stage]} Errors\n${errorList}\n\n## Source Files\n${filesContext}\n\nFix all errors. Return JSON array only.`,
        }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CI fix timeout')), 120000)
      ),
    ]);

    const text = response.content.find((b: { type: string }) => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    return parseFixes(text.text);
  } catch (error) {
    console.error(`CI fix error:`, error);
    return null;
  }
}

function parseErrors(raw: string): Array<{ file: string; line: number; message: string; code: string }> {
  try {
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
  }
  return [];
}

function parseFixes(raw: string): Array<{ path: string; code: string; changes: string }> | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
  }
  return null;
}

async function completePipeline(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string,
  allPassed: boolean | null,
): Promise<void> {
  // CI failed or skipped — complete without deployment
  if (allPassed !== true) {
    const finalStage = allPassed === null ? 'idle' : 'build_failed';
    await supabase.from('pipeline_runs').update({
      status: 'completed',
      current_stage: finalStage,
      current_task_id: null,
      completed_at: new Date().toISOString(),
    }).eq('id', pipelineId);

    await supabase.from('implementation_requests').update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', requestId);

    const msg = allPassed === null ? 'Pipeline completed (CI skipped)' : 'Pipeline completed — some CI checks failed';
    await appendLog(supabase, pipelineId, allPassed === null ? 'info' : 'warn', msg);
    return;
  }

  // CI passed — transition to autonomous deployment (FR-115)
  await supabase.from('pipeline_runs').update({
    current_stage: 'build_passed',
    last_heartbeat: new Date().toISOString(),
  }).eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'info', 'CI passed — starting autonomous deployment');

  try {
    await runDeploy(pipelineId, requestId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown deploy error';
    await appendLog(supabase, pipelineId, 'error', `Deployment crashed: ${msg}`);
    await supabase.from('pipeline_runs').update({
      status: 'completed',
      current_stage: 'deploy_failed',
      current_task_id: null,
      completed_at: new Date().toISOString(),
    }).eq('id', pipelineId);
    await supabase.from('implementation_requests').update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', requestId);
  }
}
