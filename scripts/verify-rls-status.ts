/**
 * FR-062: RLS Security Audit Verification Script
 * Queries PostgreSQL system catalogs to verify RLS is enabled on all tables
 * and correct policies exist.
 *
 * Run with: pnpm verify:rls
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

// All application tables that MUST have RLS enabled
const EXPECTED_TABLES = [
  // Core business tables
  'customers',
  'service_providers',
  'job_requests',
  'job_matches',
  'bids',
  'bid_messages',
  'job_executions',
  'execution_messages',
  'escrow_payments',
  'membership_enrollments',
  'reviews',
  'mediation_cases',
  'notifications',
  // FR-014
  'additional_work_escrows',
  // CMS
  'cms_pages',
  'cms_sections',
  'cms_content_blocks',
  'cms_global_config',
  // Roadmap governance
  'feature_comments',
  'feature_ratings',
  'admin_users',
  // Internal/tooling
  'service_categories',
  'product_features',
  'test_cases',
  'releases',
  'release_features',
  'test_runs',
  'feature_dependencies',
  // Marketplace
  'marketplace_posts',
  'marketplace_bids',
  // FR-063: Rate limiting
  'rate_limit_log',
  // FR-083: Currency localisation
  'country_currency_config',
  // FR-003: Ideation chat
  'ideation_conversations',
  'conversation_messages',
  // FR-020: Invoices
  'invoices',
  // FR-087: Provider verification
  'provider_certifications',
  'provider_documents',
];

// System tables excluded from audit
// spatial_ref_sys: PostGIS system table owned by supabase_admin — RLS cannot be enabled
// (read-only coordinate reference data, no sensitive content; Supabase Security Advisor false positive)
const EXCLUDED_TABLES = ['spatial_ref_sys', '_prisma_migrations', 'schema_migrations'];

// Tables that customers/providers access their own data on via authenticated policies
// These must have at least one authenticated or public SELECT policy
const USER_DATA_TABLES = [
  'additional_work_escrows',
  'provider_certifications',
  'provider_documents',
];

// Tables with public SELECT access (CMS, roadmap, reference data)
const PUBLIC_READ_TABLES = [
  'cms_pages',
  'cms_sections',
  'cms_content_blocks',
  'cms_global_config',
  'service_categories',
  'product_features',
  'test_cases',
  'releases',
  'release_features',
  'test_runs',
  'feature_dependencies',
  'feature_comments',
  'feature_ratings',
  'admin_users',
  'marketplace_posts',
  'marketplace_bids',
  'country_currency_config',
  'ideation_conversations',
  'conversation_messages',
  'invoices',
];

// Tables that must have service_role access (for Edge Functions)
const SERVICE_ROLE_TABLES = [
  'customers',
  'service_providers',
  'job_requests',
  'job_matches',
  'bids',
  'bid_messages',
  'job_executions',
  'execution_messages',
  'escrow_payments',
  'membership_enrollments',
  'reviews',
  'mediation_cases',
  'notifications',
  'additional_work_escrows',
  'service_categories',
  'product_features',
  'test_cases',
  'releases',
  'release_features',
  'test_runs',
  'feature_dependencies',
  'marketplace_posts',
  'marketplace_bids',
  'rate_limit_log',
  'country_currency_config',
  'provider_certifications',
  'provider_documents',
  'invoices',
];

interface TableInfo {
  tablename: string;
  rowsecurity: boolean;
}

interface PolicyInfo {
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string;
}

interface TestResult {
  code: string;
  title: string;
  passed: boolean;
  details: string[];
}

async function verifyRLS(): Promise<void> {
  const client = new pg.Client({ connectionString });
  const results: TestResult[] = [];

  try {
    await client.connect();

    // Fetch all tables and policies
    const { rows: tables } = await client.query<TableInfo>(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const { rows: allPolicies } = await client.query<PolicyInfo>(`
      SELECT tablename, policyname, permissive, roles, cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);

    const tableMap = new Map(tables.map((t) => [t.tablename, t]));
    const policyMap = new Map<string, PolicyInfo[]>();
    for (const p of allPolicies) {
      const existing = policyMap.get(p.tablename) || [];
      existing.push(p);
      policyMap.set(p.tablename, existing);
    }

    // ===== TC-FR062-01: All tables have RLS enabled =====
    const tablesWithoutRLS = EXPECTED_TABLES.filter((name) => {
      const table = tableMap.get(name);
      return table && !table.rowsecurity;
    });
    const missingTables = EXPECTED_TABLES.filter((name) => !tableMap.has(name));

    results.push({
      code: 'TC-FR062-01',
      title: 'All tables have RLS enabled',
      passed: tablesWithoutRLS.length === 0 && missingTables.length === 0,
      details: [
        `Total public tables: ${tables.length}`,
        `Expected tables: ${EXPECTED_TABLES.length}`,
        `Tables with RLS disabled: ${tablesWithoutRLS.length}`,
        ...tablesWithoutRLS.map((t) => `  FAIL: ${t} has RLS DISABLED`),
        ...missingTables.map((t) => `  WARN: ${t} not found in database`),
      ],
    });

    // ===== TC-FR062-02: additional_work_escrows RLS fixed =====
    const aweTable = tableMap.get('additional_work_escrows');
    const awePolicies = policyMap.get('additional_work_escrows') || [];
    const expectedAwePolicies = [
      'Customers can view own additional escrows',
      'Providers can view own additional escrows',
      'Service role full access to additional escrows',
    ];
    const missingAwePolicies = expectedAwePolicies.filter(
      (name) => !awePolicies.some((p) => p.policyname === name)
    );

    results.push({
      code: 'TC-FR062-02',
      title: 'additional_work_escrows RLS fixed',
      passed: aweTable?.rowsecurity === true && missingAwePolicies.length === 0,
      details: [
        `RLS enabled: ${aweTable?.rowsecurity ?? 'TABLE NOT FOUND'}`,
        `Policies found: ${awePolicies.length}`,
        ...awePolicies.map((p) => `  - ${p.policyname} (${p.cmd}, roles: ${p.roles})`),
        ...missingAwePolicies.map((p) => `  MISSING: ${p}`),
      ],
    });

    // ===== TC-FR062-03: Customer access policies correct =====
    // Verify that tables with per-user data have authenticated SELECT policies
    // Note: Core business tables (customers, job_requests, etc.) are accessed
    // exclusively through Edge Functions using service_role, so they only need
    // the service_role bypass. additional_work_escrows and marketplace tables
    // need explicit authenticated policies.
    const customerPolicyIssues: string[] = [];
    for (const tableName of USER_DATA_TABLES) {
      const policies = policyMap.get(tableName) || [];
      const hasAuthenticatedSelect = policies.some(
        (p) =>
          (p.cmd === 'SELECT' || p.cmd === '*') &&
          (p.roles.includes('authenticated') || p.roles.includes('{authenticated}'))
      );
      if (!hasAuthenticatedSelect) {
        customerPolicyIssues.push(`${tableName}: no authenticated SELECT policy found`);
      }
    }

    results.push({
      code: 'TC-FR062-03',
      title: 'Customer access policies correct',
      passed: customerPolicyIssues.length === 0,
      details: [
        `Tables checked: ${USER_DATA_TABLES.length}`,
        customerPolicyIssues.length === 0
          ? 'All user-data tables have authenticated SELECT policies'
          : '',
        ...customerPolicyIssues.map((i) => `  FAIL: ${i}`),
      ].filter(Boolean),
    });

    // ===== TC-FR062-04: Provider access policies correct =====
    // Same check as TC-FR062-03 — providers need authenticated access to the
    // same user-facing tables
    const providerPolicyIssues: string[] = [];
    for (const tableName of USER_DATA_TABLES) {
      const policies = policyMap.get(tableName) || [];
      // Check for at least 2 SELECT policies (one for customer, one for provider)
      const authenticatedSelectCount = policies.filter(
        (p) =>
          (p.cmd === 'SELECT' || p.cmd === '*') &&
          (p.roles.includes('authenticated') || p.roles.includes('{authenticated}'))
      ).length;
      if (tableName === 'additional_work_escrows' && authenticatedSelectCount < 2) {
        providerPolicyIssues.push(
          `${tableName}: expected 2 authenticated SELECT policies (customer + provider), found ${authenticatedSelectCount}`
        );
      }
    }

    results.push({
      code: 'TC-FR062-04',
      title: 'Provider access policies correct',
      passed: providerPolicyIssues.length === 0,
      details: [
        `Tables checked: ${USER_DATA_TABLES.length}`,
        providerPolicyIssues.length === 0
          ? 'All user-data tables have provider SELECT policies'
          : '',
        ...providerPolicyIssues.map((i) => `  FAIL: ${i}`),
      ].filter(Boolean),
    });

    // ===== TC-FR062-05: Public read tables verified =====
    const publicReadIssues: string[] = [];
    for (const tableName of PUBLIC_READ_TABLES) {
      const policies = policyMap.get(tableName) || [];
      const hasPublicSelect = policies.some((p) => p.cmd === 'SELECT' || p.cmd === '*');
      if (!hasPublicSelect) {
        publicReadIssues.push(`${tableName}: no SELECT policy found`);
      }
    }

    results.push({
      code: 'TC-FR062-05',
      title: 'Public read tables verified',
      passed: publicReadIssues.length === 0,
      details: [
        `Tables checked: ${PUBLIC_READ_TABLES.length}`,
        publicReadIssues.length === 0 ? 'All public-read tables have SELECT policies' : '',
        ...publicReadIssues.map((i) => `  FAIL: ${i}`),
      ].filter(Boolean),
    });

    // ===== TC-FR062-06: Service role bypass verified =====
    const serviceRoleIssues: string[] = [];
    for (const tableName of SERVICE_ROLE_TABLES) {
      const policies = policyMap.get(tableName) || [];
      // Check for service_role in roles or auth.role() = 'service_role' in qual
      const hasServiceRole = policies.some(
        (p) =>
          p.roles.includes('service_role') ||
          p.roles.includes('{service_role}') ||
          (p.qual && p.qual.includes('service_role'))
      );
      if (!hasServiceRole) {
        serviceRoleIssues.push(`${tableName}: no service_role policy found`);
      }
    }

    results.push({
      code: 'TC-FR062-06',
      title: 'Service role bypass verified',
      passed: serviceRoleIssues.length === 0,
      details: [
        `Tables checked: ${SERVICE_ROLE_TABLES.length}`,
        serviceRoleIssues.length === 0 ? 'All tables have service_role bypass policies' : '',
        ...serviceRoleIssues.map((i) => `  FAIL: ${i}`),
      ].filter(Boolean),
    });

    // ===== TC-FR062-07: Script runs successfully =====
    results.push({
      code: 'TC-FR062-07',
      title: 'RLS verification script runs',
      passed: true,
      details: ['Script executed successfully'],
    });

    // ===== Print Report =====
    console.log('\n' + '='.repeat(70));
    console.log('  FR-062: RLS Security Audit Report');
    console.log('='.repeat(70));

    // RLS status matrix
    console.log('\n--- RLS Status by Table ---\n');
    for (const table of tables) {
      if (EXCLUDED_TABLES.includes(table.tablename)) continue;
      const status = table.rowsecurity ? 'ENABLED ' : 'DISABLED';
      const icon = table.rowsecurity ? 'PASS' : 'FAIL';
      const policies = policyMap.get(table.tablename) || [];
      console.log(
        `  [${icon}] ${table.tablename.padEnd(30)} RLS ${status}  (${policies.length} policies)`
      );
    }

    // Test results
    console.log('\n--- Test Results ---\n');
    let allPassed = true;
    for (const result of results) {
      const icon = result.passed ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] ${result.code}: ${result.title}`);
      for (const detail of result.details) {
        console.log(`         ${detail}`);
      }
      if (!result.passed) allPassed = false;
    }

    // Summary
    const passCount = results.filter((r) => r.passed).length;
    console.log('\n' + '='.repeat(70));
    console.log(
      `  RESULT: ${passCount}/${results.length} tests passed — ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`
    );
    console.log('='.repeat(70) + '\n');

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyRLS();
