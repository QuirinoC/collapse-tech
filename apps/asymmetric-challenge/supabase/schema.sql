create extension if not exists "pgcrypto";

create table if not exists winners (
  id uuid primary key default gen_random_uuid(),
  claim_token text not null unique,
  winner_slot smallint not null default 1 check (winner_slot = 1),
  unique (winner_slot),
  claimed_at timestamptz not null default now()
);

do $$
begin
  if (select count(*) from winners) > 1 then
    raise exception
      'winners contains multiple records; resolve the historical duplicate claims before applying this migration';
  end if;
end
$$;

do $$
declare
  telemetry_totals_kind "char";
begin
  select relkind
  into telemetry_totals_kind
  from pg_class
  where oid = to_regclass('public.telemetry_totals');

  if telemetry_totals_kind = 'v' then
    execute 'drop view public.telemetry_totals';
  end if;
end
$$;

create table if not exists telemetry_totals (
  id smallint primary key default 1 check (id = 1),
  attempts_total bigint not null default 0 check (attempts_total >= 0),
  attempts_auto bigint not null default 0 check (attempts_auto >= 0),
  attempts_manual bigint not null default 0 check (attempts_manual >= 0),
  check (attempts_total = attempts_auto + attempts_manual)
);

do $$
begin
  if to_regclass('public.telemetry_aggregates') is not null then
    execute $migration$
      insert into public.telemetry_totals (
        id,
        attempts_total,
        attempts_auto,
        attempts_manual
      )
      select
        1,
        coalesce(sum(attempts_total), 0),
        coalesce(sum(attempts_auto), 0),
        coalesce(sum(attempts_manual), 0)
      from public.telemetry_aggregates
      on conflict (id) do nothing
    $migration$;
    execute 'drop table public.telemetry_aggregates';
  end if;
end
$$;

insert into telemetry_totals (id)
values (1)
on conflict (id) do nothing;

alter table winners add column if not exists winner_slot smallint;
update winners set winner_slot = 1 where winner_slot is null;
alter table winners alter column winner_slot set default 1;
alter table winners alter column winner_slot set not null;

do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.winners'::regclass
      and attname = 'client_id'
      and not attisdropped
  ) then
    alter table winners alter column client_id drop not null;
  end if;

  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.winners'::regclass
      and attname = 'session_id'
      and not attisdropped
  ) then
    alter table winners alter column session_id drop not null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'winners_winner_slot_check'
      and conrelid = 'public.winners'::regclass
  ) then
    alter table winners
      add constraint winners_winner_slot_check check (winner_slot = 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'winners_winner_slot_key'
      and conrelid = 'public.winners'::regclass
  ) then
    alter table winners
      add constraint winners_winner_slot_key unique (winner_slot);
  end if;
end
$$;

alter table winners enable row level security;
alter table telemetry_totals enable row level security;
alter table if exists telemetry_aggregates enable row level security;

create or replace function public.record_telemetry(
  in_attempts_total bigint,
  in_attempts_auto bigint,
  in_attempts_manual bigint
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into public.telemetry_totals (
    id,
    attempts_total,
    attempts_auto,
    attempts_manual
  )
  values (1, in_attempts_total, in_attempts_auto, in_attempts_manual)
  on conflict (id) do update
  set attempts_total = public.telemetry_totals.attempts_total + excluded.attempts_total,
      attempts_auto = public.telemetry_totals.attempts_auto + excluded.attempts_auto,
      attempts_manual = public.telemetry_totals.attempts_manual + excluded.attempts_manual;
$$;

revoke all on function public.record_telemetry(bigint, bigint, bigint) from public;
grant execute on function public.record_telemetry(bigint, bigint, bigint) to service_role;
