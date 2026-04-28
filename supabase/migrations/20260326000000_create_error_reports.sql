-- FR-089: Browser Error Capture Plugin — error_reports table

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  error_hash text not null,
  url text not null,
  user_agent text not null,
  error_type text not null check (error_type in ('javascript', 'network', 'manual')),
  error_data jsonb not null default '{}',
  dom_context jsonb not null default '{}',
  session_context jsonb not null default '{}',
  screenshot text,
  status text not null default 'pending' check (status in ('pending', 'analyzing', 'analyzed', 'failed')),
  analysis text,
  diagnosis text,
  fix_suggestions jsonb,
  priority text check (priority in ('low', 'medium', 'high', 'critical')),
  estimated_effort text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for rate limiting and duplicate detection
create index if not exists idx_error_reports_user_created on public.error_reports (user_id, created_at desc);
create index if not exists idx_error_reports_user_hash on public.error_reports (user_id, error_hash, created_at desc);
create index if not exists idx_error_reports_status on public.error_reports (status);

-- RLS
alter table public.error_reports enable row level security;

-- Admin-only access (uses admin_users table)
DROP POLICY IF EXISTS "Admins can read error reports" ON public.error_reports;
create policy "Admins can read error reports"
  on public.error_reports for select
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Admins can insert error reports" ON public.error_reports;
create policy "Admins can insert error reports"
  on public.error_reports for insert
  with check (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Admins can update error reports" ON public.error_reports;
create policy "Admins can update error reports"
  on public.error_reports for update
  using (
    exists (
      select 1 from public.admin_users
      where admin_users.user_id = auth.uid()::text
    )
  );

-- Service role bypass for Edge Functions
DROP POLICY IF EXISTS "Service role full access to error reports" ON public.error_reports;
create policy "Service role full access to error reports"
  on public.error_reports for all
  using (auth.role() = 'service_role');
