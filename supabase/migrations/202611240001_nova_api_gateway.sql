-- NOVA API Gateway & Provider Management Schema
-- Target Supabase Project: jlexjqlehjtjzjoqgcwo

create extension if not exists pgcrypto;

create table if not exists public.nova_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  base_url text not null,
  api_style text not null,
  auth_type text not null default 'none',
  capabilities text[] not null default '{}',
  request_method text not null default 'GET',
  enabled boolean not null default true,
  health_status text not null default 'unknown',
  last_checked_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_models (
  id uuid primary key default gen_random_uuid(),
  model_key text not null unique,
  name text not null,
  provider_id uuid not null references public.nova_providers(id) on delete cascade,
  model_identifier text not null,
  capabilities text[] not null default '{}',
  supported_languages text[] not null default '{en}',
  input_types text[] not null default '{text}',
  output_types text[] not null default '{text}',
  streaming_support boolean not null default false,
  config_schema jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_fallback_rules (
  id uuid primary key default gen_random_uuid(),
  capability text not null,
  primary_provider_slug text not null,
  primary_model_key text,
  fallback_provider_slug text not null,
  fallback_model_key text not null,
  require_compatible_io boolean not null default true,
  priority integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_api_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  provider_slug text not null,
  model_key text,
  endpoint text not null,
  method text not null,
  status_code integer not null,
  duration_ms integer not null default 0,
  success boolean not null default false,
  error_class text,
  error_message text,
  redacted_meta jsonb not null default '{}'::jsonb,
  user_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.nova_jobs (
  id text primary key,
  job_type text not null,
  provider_slug text not null,
  model_key text not null,
  prompt text,
  status text not null default 'queued',
  error_message text,
  storage_path text,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_assets (
  id uuid primary key default gen_random_uuid(),
  job_id text references public.nova_jobs(id) on delete set null,
  bucket_id text not null default 'nova-assets',
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  prompt text,
  provider text not null,
  model text not null,
  aspect_ratio text default '1:1',
  user_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_nova_api_logs_created_at on public.nova_api_logs (created_at desc);
create index if not exists idx_nova_api_logs_provider on public.nova_api_logs (provider_slug, created_at desc);
create index if not exists idx_nova_assets_job_id on public.nova_assets (job_id);

-- Row Level Security
alter table public.nova_providers enable row level security;
alter table public.nova_models enable row level security;
alter table public.nova_fallback_rules enable row level security;
alter table public.nova_api_logs enable row level security;
alter table public.nova_jobs enable row level security;
alter table public.nova_assets enable row level security;

-- Public read access for active non-secret catalog metadata
create policy "Public read active providers" on public.nova_providers
  for select using (enabled = true);

create policy "Public read active models" on public.nova_models
  for select using (active = true);

-- Admin-only full access (service_role bypasses RLS; authenticated admin JWT verified)
create policy "Admin manage providers" on public.nova_providers
  for all using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "Admin manage models" on public.nova_models
  for all using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "Admin manage fallback rules" on public.nova_fallback_rules
  for all using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "Admin read api logs" on public.nova_api_logs
  for select using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "User read own assets" on public.nova_assets
  for select using (auth.uid()::text = user_id or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');
