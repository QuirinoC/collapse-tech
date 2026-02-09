create extension if not exists "pgcrypto";

create table if not exists telemetry_aggregates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  attempts_total bigint not null,
  attempts_auto bigint not null,
  attempts_manual bigint not null,
  auto_enabled boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists winners (
  id uuid primary key default gen_random_uuid(),
  claim_token text not null unique,
  client_id uuid not null,
  session_id uuid not null,
  claimed_at timestamptz not null default now()
);

create or replace view telemetry_totals as
select
  coalesce(sum(attempts_total), 0) as attempts_total,
  coalesce(sum(attempts_auto), 0) as attempts_auto,
  coalesce(sum(attempts_manual), 0) as attempts_manual
from telemetry_aggregates;
