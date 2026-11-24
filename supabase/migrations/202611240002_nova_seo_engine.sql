-- NOVA Advanced SEO Engine & Search Console Tracking Schema
-- Target Supabase Project: jlexjqlehjtjzjoqgcwo

create table if not exists public.nova_seo_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  path text not null unique,
  page_type text not null check (page_type in ('core', 'tool', 'programmatic_tool', 'model', 'category', 'doc', 'guide', 'anime')),
  lang text not null default 'en',
  hreflang_group text,
  title text not null,
  description text not null,
  canonical_url text not null,
  og_image text,
  robots text not null default 'index,follow',
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  indexing_status text not null default 'published' check (indexing_status in ('published', 'sitemap_submitted', 'discovered', 'crawled', 'indexed', 'excluded', 'error')),
  content_markdown text not null default '',
  structured_data jsonb not null default '{}'::jsonb,
  internal_links text[] not null default '{}',
  seo_score integer not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.nova_seo_redirects (
  id uuid primary key default gen_random_uuid(),
  source_path text not null unique,
  target_path text not null,
  status_code integer not null default 301 check (status_code in (301, 302, 307, 308)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.nova_seo_automation_logs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null check (status in ('completed', 'failed', 'skipped')),
  pages_scanned integer not null default 0,
  issues_found integer not null default 0,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.nova_gsc_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  metric_date date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  position double precision not null default 0,
  report_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (site_url, metric_date)
);

create index if not exists idx_nova_seo_pages_type_lang on public.nova_seo_pages (page_type, lang, status);
create index if not exists idx_nova_seo_pages_group on public.nova_seo_pages (hreflang_group);

alter table public.nova_seo_pages enable row level security;
alter table public.nova_seo_redirects enable row level security;
alter table public.nova_seo_automation_logs enable row level security;
alter table public.nova_gsc_snapshots enable row level security;

-- Public read strictly for published indexable pages & active redirects
create policy "Public read published seo pages" on public.nova_seo_pages
  for select using (status = 'published' and robots not like '%noindex%');

create policy "Public read active redirects" on public.nova_seo_redirects
  for select using (active = true);

-- Admin full control
create policy "Admin manage seo pages" on public.nova_seo_pages
  for all using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "Admin manage seo redirects" on public.nova_seo_redirects
  for all using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "Admin read seo automation logs" on public.nova_seo_automation_logs
  for select using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');

create policy "Admin manage gsc snapshots" on public.nova_gsc_snapshots
  for all using ((auth.jwt() ->> 'role') = 'admin' or (auth.jwt() ->> 'email') = 'sovereign.empirex@gmail.com');
