/**
 * FR-164 J4 — Constitution merger.
 *
 * Reads the shared `.specify/memory/constitution.md`, parses it into a Map
 * keyed on `principle_key` (Roman-numeral lowercase, e.g. 'i', 'ii', 'iii'),
 * loads the calling tenant's `tenant_constitution_overrides`, and returns a
 * merged map that codegen-time constitution checks should run against.
 *
 * NON-NEGOTIABLE principles are flagged in the source markdown via the
 * `(NON-NEGOTIABLE)` suffix on the heading. When a tenant override targets
 * such a principle and the override row has `non_negotiable_strengthen_only=
 * true` (the default), the merger refuses to apply the override (logs warn,
 * keeps the source text). Strengthening a NON-NEGOTIABLE principle would
 * require setting `non_negotiable_strengthen_only=false` and adding text
 * that is strictly more restrictive — not validated programmatically in v1,
 * relies on operator review.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Principle {
  key: string;
  title: string;
  text: string;
  nonNegotiable: boolean;
  source: 'shared' | 'tenant_override';
}

export interface MergerWarning {
  principle_key: string;
  reason: 'non_negotiable_blocked' | 'unknown_principle';
  override_row_id?: string;
}

export interface MergerResult {
  merged: Map<string, Principle>;
  warnings: MergerWarning[];
}

const DEFAULT_PATH = resolve(process.cwd(), '.specify/memory/constitution.md');

/** Parse `constitution.md` into a map keyed on lowercased Roman numeral. */
export function parseSharedConstitution(filePath: string = DEFAULT_PATH): Map<string, Principle> {
  const raw = readFileSync(filePath, 'utf-8');
  const corePrinciples = extractSection(raw, 'Core Principles');
  const map = new Map<string, Principle>();
  const parts = corePrinciples.split(/(?=### [IVXLC]+\.)/);
  for (const part of parts) {
    const lines = part.split('\n');
    const headerMatch = lines[0]?.match(/^### ([IVXLC]+)\.\s+(.+?)(?:\s+\(NON-NEGOTIABLE\))?\s*$/);
    if (!headerMatch) continue;
    const [, roman, title] = headerMatch;
    const nonNegotiable = lines[0].includes('(NON-NEGOTIABLE)');
    const text = lines.slice(1).join('\n').trim();
    map.set(roman.toLowerCase(), {
      key: roman.toLowerCase(),
      title: title.trim(),
      text,
      nonNegotiable,
      source: 'shared',
    });
  }
  return map;
}

interface OverrideRow {
  id: string;
  principle_key: string;
  override_text: string;
  non_negotiable_strengthen_only: boolean;
}

/** Load overrides for one tenant and merge into the shared map. */
export async function mergeWithTenantOverrides(
  shared: Map<string, Principle>,
  supabase: SupabaseClient,
  tenantId: string
): Promise<MergerResult> {
  const merged = new Map(shared);
  const warnings: MergerWarning[] = [];

  const { data: overrides, error } = await supabase
    .from('tenant_constitution_overrides')
    .select('id, principle_key, override_text, non_negotiable_strengthen_only')
    .eq('tenant_id', tenantId);

  if (error) {
    console.warn('[constitution-merger] override fetch error:', error.message);
    return { merged, warnings };
  }

  for (const row of (overrides ?? []) as OverrideRow[]) {
    const target = merged.get(row.principle_key);
    if (!target) {
      warnings.push({
        principle_key: row.principle_key,
        reason: 'unknown_principle',
        override_row_id: row.id,
      });
      continue;
    }
    if (target.nonNegotiable && row.non_negotiable_strengthen_only) {
      warnings.push({
        principle_key: row.principle_key,
        reason: 'non_negotiable_blocked',
        override_row_id: row.id,
      });
      continue;
    }
    merged.set(row.principle_key, {
      key: row.principle_key,
      title: target.title,
      text: row.override_text,
      nonNegotiable: target.nonNegotiable,
      source: 'tenant_override',
    });
  }
  return { merged, warnings };
}

/** Convenience: parse + merge in one call. */
export async function loadEffectiveConstitution(
  supabase: SupabaseClient,
  tenantId: string,
  filePath: string = DEFAULT_PATH
): Promise<MergerResult> {
  const shared = parseSharedConstitution(filePath);
  return mergeWithTenantOverrides(shared, supabase, tenantId);
}

function extractSection(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = content.match(re);
  return m ? m[1] : '';
}
