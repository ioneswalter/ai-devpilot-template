/**
 * Constitution Publish Edge Function (FR-128)
 * POST: Publish a new version with rules (optimistic locking)
 * GET?action=bindings: Get template binding statuses
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.22.4';
import {
  success,
  badRequest,
  forbidden,
  internalError,
  corsResponse,
} from '../_shared/response.ts';
import { requireAdmin } from '../_shared/admin-auth.ts';
import { bumpVersion, compareSemVer } from '../_shared/constitution-utils.ts';
import type { BumpType } from '../_shared/constitution-utils.ts';

/** Zod schema for rule input validation (T017) */
const RuleInputSchema = z.object({
  rule_number: z.string().min(1).max(10),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z.string().nullable(),
  is_non_negotiable: z.boolean(),
  sort_order: z.number().int().min(0),
});

/** Zod schema for publish request validation (T017) */
const PublishBodySchema = z.object({
  bump_type: z.enum(['major', 'minor', 'patch']),
  summary_of_changes: z.string().min(1).max(1000),
  rules: z.array(RuleInputSchema).min(1).max(50),
  expected_version_id: z.string().uuid(),
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface RuleInput {
  rule_number: string;
  title: string;
  content: string;
  category: string | null;
  is_non_negotiable: boolean;
  sort_order: number;
}

interface PublishBody {
  bump_type: BumpType;
  summary_of_changes: string;
  rules: RuleInput[];
  expected_version_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsResponse(req);
  }

  let admin;
  try {
    admin = await requireAdmin(req);
  } catch {
    return forbidden('Admin access required', req);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // GET: return template bindings
  if (req.method === 'GET') {
    return handleGetBindings(supabase, req);
  }

  if (req.method !== 'POST') {
    return badRequest('Method not allowed', undefined, req);
  }

  try {
    const rawBody = await req.json();
    const parsed = PublishBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return badRequest('Invalid publish request', parsed.error.flatten().fieldErrors, req);
    }
    return await handlePublish(supabase, parsed.data, admin.id, req);
  } catch (err) {
    console.error('Constitution publish error:', err);
    const msg = err instanceof Error ? err.message : 'Publish failed';
    return internalError(msg, undefined, req);
  }
});

async function handleGetBindings(
  supabase: ReturnType<typeof createClient>,
  req: Request
): Promise<Response> {
  try {
    const { data: bindings } = await supabase
      .from('template_bindings')
      .select('*')
      .order('template_name');

    const { data: activeVersions } = await supabase
      .from('constitution_versions')
      .select('id, version')
      .eq('status', 'active')
      .limit(1);

    const activeVersion = activeVersions?.[0];
    const enriched = (bindings ?? []).map((b: Record<string, unknown>) => ({
      ...b,
      active_version: activeVersion?.version ?? 'unknown',
      is_outdated: activeVersion ? b.last_synced_version_id !== activeVersion.id : false,
    }));

    return success({ bindings: enriched }, 200, req);
  } catch (err) {
    console.error('Get bindings error:', err);
    return internalError('Failed to fetch bindings', undefined, req);
  }
}

async function handlePublish(
  supabase: ReturnType<typeof createClient>,
  body: PublishBody,
  adminId: string,
  req: Request
): Promise<Response> {
  const { bump_type, summary_of_changes, rules, expected_version_id } = body;

  if (!bump_type || !summary_of_changes || !rules?.length) {
    return badRequest('bump_type, summary_of_changes, and rules are required', undefined, req);
  }

  // Optimistic lock: verify expected version is still active (T016)
  const { data: activeVersions } = await supabase
    .from('constitution_versions')
    .select('*')
    .eq('status', 'active')
    .limit(1);

  const currentActive = activeVersions?.[0];
  if (!currentActive) {
    return badRequest('No active constitution version found', undefined, req);
  }

  if (currentActive.id !== expected_version_id) {
    return badRequest(
      'Constitution was modified since you loaded it. Please reload and try again.',
      { conflict: true, active_version: currentActive.version },
      req
    );
  }

  // Compute new version
  const newVersion = bumpVersion(currentActive.version as string, bump_type);

  // Check version doesn't already exist
  const { data: existingVersion } = await supabase
    .from('constitution_versions')
    .select('id')
    .eq('version', newVersion)
    .limit(1);

  if (existingVersion && existingVersion.length > 0) {
    return badRequest(`Version ${newVersion} already exists`, undefined, req);
  }

  // Archive current active version
  await supabase
    .from('constitution_versions')
    .update({ status: 'archived' })
    .eq('id', currentActive.id);

  // Create new version
  const { data: newVer, error: verErr } = await supabase
    .from('constitution_versions')
    .insert({
      version: newVersion,
      status: 'active',
      summary_of_changes,
      created_by: adminId,
      published_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (verErr || !newVer) {
    // Rollback: re-activate old version
    await supabase
      .from('constitution_versions')
      .update({ status: 'active' })
      .eq('id', currentActive.id);
    return internalError('Failed to create new version', undefined, req);
  }

  const newVersionId = (newVer as Record<string, unknown>).id as string;

  // Insert rules
  const ruleInserts = rules.map((r) => ({
    version_id: newVersionId,
    rule_number: r.rule_number,
    title: r.title,
    content: r.content,
    category: r.category,
    is_non_negotiable: r.is_non_negotiable,
    sort_order: r.sort_order,
  }));

  await supabase.from('constitution_rules').insert(ruleInserts);

  // Create audit log entries by diffing old vs new rules
  const auditEntries = await createAuditEntries(
    supabase,
    currentActive.id as string,
    newVersionId,
    rules,
    adminId
  );

  // T024: Update template bindings to mark them outdated
  // (lazy propagation - actual content update happens on access)
  // We don't update the bindings here; the outdated check
  // is done by comparing last_synced_version_id to active version

  return success(
    {
      version: newVer,
      rules_count: rules.length,
      audit_entries_count: auditEntries,
    },
    201,
    req
  );
}

async function createAuditEntries(
  supabase: ReturnType<typeof createClient>,
  oldVersionId: string,
  newVersionId: string,
  newRules: RuleInput[],
  adminId: string
): Promise<number> {
  // Get old rules
  const { data: oldRules } = await supabase
    .from('constitution_rules')
    .select('*')
    .eq('version_id', oldVersionId);

  const oldByNumber = new Map<string, Record<string, unknown>>();
  for (const r of oldRules ?? []) {
    const rule = r as Record<string, unknown>;
    oldByNumber.set(rule.rule_number as string, rule);
  }

  const entries: Array<Record<string, unknown>> = [];

  for (const nr of newRules) {
    const oldRule = oldByNumber.get(nr.rule_number);
    if (!oldRule) {
      entries.push({
        version_from_id: oldVersionId,
        version_to_id: newVersionId,
        rule_number: nr.rule_number,
        field_changed: 'added',
        old_value: null,
        new_value: nr.title,
        changed_by: adminId,
      });
      continue;
    }

    if (oldRule.title !== nr.title) {
      entries.push({
        version_from_id: oldVersionId,
        version_to_id: newVersionId,
        rule_number: nr.rule_number,
        field_changed: 'title',
        old_value: oldRule.title as string,
        new_value: nr.title,
        changed_by: adminId,
      });
    }
    if (oldRule.content !== nr.content) {
      entries.push({
        version_from_id: oldVersionId,
        version_to_id: newVersionId,
        rule_number: nr.rule_number,
        field_changed: 'content',
        old_value: (oldRule.content as string).slice(0, 500),
        new_value: nr.content.slice(0, 500),
        changed_by: adminId,
      });
    }
    if (oldRule.is_non_negotiable !== nr.is_non_negotiable) {
      entries.push({
        version_from_id: oldVersionId,
        version_to_id: newVersionId,
        rule_number: nr.rule_number,
        field_changed: 'is_non_negotiable',
        old_value: String(oldRule.is_non_negotiable),
        new_value: String(nr.is_non_negotiable),
        changed_by: adminId,
      });
    }
    oldByNumber.delete(nr.rule_number);
  }

  // Detect removed rules
  for (const [num, old] of oldByNumber) {
    entries.push({
      version_from_id: oldVersionId,
      version_to_id: newVersionId,
      rule_number: num,
      field_changed: 'removed',
      old_value: old.title as string,
      new_value: null,
      changed_by: adminId,
    });
  }

  if (entries.length > 0) {
    await supabase.from('constitution_audit_log').insert(entries);
  }

  return entries.length;
}
