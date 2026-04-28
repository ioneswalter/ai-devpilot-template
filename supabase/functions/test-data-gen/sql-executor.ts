/**
 * SQL execution and schema introspection helpers for test data generation (FR-111)
 */

/** Get a pg Client using the built-in SUPABASE_DB_URL or fallback */
export async function getPgClient() {
  const pg = (await import('npm:pg@8.13.1')).default;
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (dbUrl) {
    return new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
  }
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').split('.')[0];
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const connStr = `postgresql://postgres.${ref}:${key}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
  return new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
}

/** Fetch database schema as a compact hint string */
export async function getSchemaHint(): Promise<string> {
  try {
    const client = await getPgClient();
    await client.connect();
    const res = await client.query(`
      SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
             c.column_default
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON c.table_name = t.table_name AND c.table_schema = t.table_schema
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `);
    await client.end();

    type ColRow = {
      table_name: string;
      column_name: string;
      data_type: string;
      column_default: string | null;
    };
    const tables = new Map<string, string[]>();
    for (const r of res.rows as ColRow[]) {
      if (!tables.has(r.table_name)) tables.set(r.table_name, []);
      const defaultHint = r.column_default ? ' DEFAULT' : '';
      tables.get(r.table_name)!.push(`${r.column_name} ${r.data_type}${defaultHint}`);
    }

    const lines = Array.from(tables.entries())
      .map(([t, cols]) => `${t}(${cols.join(', ')})`)
      .join('\n');
    return `Database schema:\n${lines}`;
  } catch (err) {
    console.warn('getSchemaHint failed (non-fatal):', err instanceof Error ? err.message : err);
    return '';
  }
}

/** Execute SQL statements against the database. Accepts raw text or pre-split array. */
export async function executeSql(input: string | string[], featureId: string) {
  const client = await getPgClient();
  await client.connect();

  const statements = Array.isArray(input)
    ? input
    : input
        .replace(/```sql?\s*/gi, '')
        .replace(/```/g, '')
        .trim()
        .split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 5);

  let inserted = 0;
  const errors: string[] = [];

  for (const stmt of statements) {
    try {
      await client.query(`/* test-data-gen:${featureId} */ ${stmt}`);
      inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg.substring(0, 200));
    }
  }

  await client.end();
  return { inserted, total: statements.length, errors };
}
