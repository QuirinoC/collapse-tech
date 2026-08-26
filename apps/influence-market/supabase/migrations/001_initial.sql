-- Influence.Market initial schema.
create extension if not exists pgcrypto;

-- Brands and creators. Passwords are scrypt hashes ("s1:salt:hash").
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('brand', 'creator')),
  email text not null unique,
  password_hash text not null,
  company text,
  name text not null,
  bio text,
  niches text[] not null default '{}',
  channels jsonb not null default '[]',
  min_budget_cents integer check (min_budget_cents >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_profile_idx on public.sessions(profile_id);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  brief text not null,
  product_info text,
  platforms text[] not null,
  niches text[] not null,
  demographics text,
  follower_min integer,
  follower_max integer,
  slots integer not null check (slots between 1 and 50),
  slots_remaining integer not null,
  budget_cents integer not null check (budget_cents >= 10000),
  fee_cents integer not null,
  per_creator_cents integer not null,
  status text not null default 'open'
    check (status in ('open', 'funded', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'held', 'settled', 'refunded')),
  payment_ref text,
  funded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_brand_idx on public.campaigns(brand_id);
create index if not exists campaigns_status_idx on public.campaigns(status);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  pitch text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index if not exists applications_campaign_idx on public.applications(campaign_id);
create index if not exists applications_creator_idx on public.applications(creator_id);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'instructions_sent'
    check (status in ('instructions_sent', 'submitted', 'approved', 'paid', 'rejected', 'declined')),
  content_url text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  paid_at timestamptz,
  payout_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

create index if not exists assignments_campaign_idx on public.assignments(campaign_id);
create index if not exists assignments_creator_idx on public.assignments(creator_id);

-- Append-only money trail: charge (brand funds in), platform_fee, payout
-- (creator funds out), refund. All amounts integer cents.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  kind text not null check (kind in ('charge', 'platform_fee', 'payout', 'refund')),
  amount_cents integer not null check (amount_cents > 0),
  provider_ref text,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists ledger_campaign_idx on public.ledger_entries(campaign_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  kind text not null check (kind in ('brand', 'creator', 'other')),
  message text not null,
  created_at timestamptz not null default now()
);
