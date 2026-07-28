create type public.analysis_verdict as enum ('clear', 'review', 'hold');

create table public.repos (
  id uuid primary key default gen_random_uuid(),
  github_url text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  last_analyzed_at timestamptz
);

create table public.commits (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  sha text not null,
  message text not null,
  author text not null,
  diff_url text not null,
  analyzed_at timestamptz,
  unique (repo_id, sha)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  commit_id uuid not null unique references public.commits(id) on delete cascade,
  verdict public.analysis_verdict not null,
  reference_check jsonb not null default '{"flaggedSymbols": []}'::jsonb,
  intent_match jsonb not null default '{}'::jsonb,
  coverage_delta jsonb not null default '{}'::jsonb,
  rationale text not null,
  raw_model_output jsonb not null default '{}'::jsonb
);

create index commits_repo_id_analyzed_at_idx on public.commits (repo_id, analyzed_at desc);
create index analyses_verdict_idx on public.analyses (verdict);

alter table public.repos enable row level security;
alter table public.commits enable row level security;
alter table public.analyses enable row level security;
