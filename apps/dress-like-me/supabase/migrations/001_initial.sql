create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  bio text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_aliases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  normalized_alias text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.source_accounts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  platform text not null check (platform in ('instagram')),
  handle text not null,
  profile_url text not null,
  relationship text not null default 'reference'
    check (relationship in ('official', 'reference', 'fan', 'editorial')),
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

create table if not exists public.source_posts (
  id uuid primary key default gen_random_uuid(),
  source_account_id uuid references public.source_accounts(id) on delete set null,
  platform text not null check (platform in ('instagram')),
  canonical_url text not null unique,
  source_title text,
  caption text,
  fetched_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  source_post_id uuid not null references public.source_posts(id) on delete restrict,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'removed')),
  model_name text not null,
  prompt_version text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  source_url text not null,
  requester_hash text not null,
  workflow_run_id text,
  status text not null default 'queued'
    check (status in ('queued', 'fetching', 'analyzing', 'matching', 'complete', 'failed')),
  outfit_id uuid references public.outfits(id) on delete set null,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.garments (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  position integer not null check (position >= 0),
  category text not null,
  subtype text not null,
  colors text[] not null default '{}',
  materials text[] not null default '{}',
  pattern text not null,
  fit text not null,
  details text[] not null default '{}',
  brand_evidence text,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  search_query text not null,
  created_at timestamptz not null default now(),
  unique (outfit_id, position)
);

create table if not exists public.product_matches (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garments(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  title text not null,
  merchant text not null,
  price_text text,
  product_url text not null,
  image_url text,
  rating numeric(3, 2),
  rank integer not null check (rank >= 0),
  fetched_at timestamptz not null default now(),
  unique (garment_id, provider, provider_id)
);

create table if not exists public.search_events (
  id bigint generated always as identity primary key,
  normalized_query text not null,
  session_hash text not null,
  result_count integer not null default 0 check (result_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.popularity_rollups (
  person_id uuid not null references public.people(id) on delete cascade,
  period_start date not null,
  search_count integer not null default 0,
  unique_sessions integer not null default 0,
  score numeric not null default 0,
  primary key (person_id, period_start)
);

create table if not exists public.takedowns (
  id uuid primary key default gen_random_uuid(),
  source_post_id uuid references public.source_posts(id) on delete set null,
  source_url text not null,
  reason text,
  status text not null default 'active'
    check (status in ('active', 'released')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create index if not exists ingestion_jobs_source_created_idx
  on public.ingestion_jobs (source_url, created_at desc);
create index if not exists ingestion_jobs_requester_created_idx
  on public.ingestion_jobs (requester_hash, created_at desc);
create index if not exists ingestion_jobs_status_idx
  on public.ingestion_jobs (status, updated_at);
create index if not exists search_events_query_created_idx
  on public.search_events (normalized_query, created_at desc);
create index if not exists outfits_person_published_idx
  on public.outfits (person_id, published_at desc)
  where status = 'published';

alter table public.people enable row level security;
alter table public.person_aliases enable row level security;
alter table public.source_accounts enable row level security;
alter table public.source_posts enable row level security;
alter table public.outfits enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.garments enable row level security;
alter table public.product_matches enable row level security;
alter table public.search_events enable row level security;
alter table public.popularity_rollups enable row level security;
alter table public.takedowns enable row level security;

create policy "Published people are public"
  on public.people for select using (is_published);
create policy "Published aliases are public"
  on public.person_aliases for select using (
    exists (
      select 1 from public.people
      where people.id = person_aliases.person_id and people.is_published
    )
  );
create policy "Published source accounts are public"
  on public.source_accounts for select using (
    person_id is null or exists (
      select 1 from public.people
      where people.id = source_accounts.person_id and people.is_published
    )
  );
create policy "Active published source posts are public"
  on public.source_posts for select using (
    removed_at is null and exists (
      select 1 from public.outfits
      where outfits.source_post_id = source_posts.id
        and outfits.status = 'published'
    )
  );
create policy "Published outfits are public"
  on public.outfits for select using (status = 'published');
create policy "Published garments are public"
  on public.garments for select using (
    exists (
      select 1 from public.outfits
      where outfits.id = garments.outfit_id and outfits.status = 'published'
    )
  );
create policy "Published product matches are public"
  on public.product_matches for select using (
    exists (
      select 1
      from public.garments
      join public.outfits on outfits.id = garments.outfit_id
      where garments.id = product_matches.garment_id
        and outfits.status = 'published'
    )
  );
create policy "Popularity rollups are public"
  on public.popularity_rollups for select using (true);

insert into public.people (slug, name, bio, is_published)
values (
  'shia-labeouf',
  'Shia LaBeouf',
  'Workwear, thrift-store sportswear, hard-worn boots, and studied nonchalance.',
  true
)
on conflict (slug) do update
set name = excluded.name,
    bio = excluded.bio,
    is_published = excluded.is_published,
    updated_at = now();

insert into public.person_aliases (person_id, normalized_alias)
select id, alias
from public.people
cross join unnest(array['shia', 'shia labeouf', 'shia lebeouf']) as alias
where slug = 'shia-labeouf'
on conflict (normalized_alias) do nothing;

create or replace function public.reserve_ingestion_job(
  p_source_url text,
  p_requester_hash text,
  p_hourly_limit integer default 5
)
returns table (
  id uuid,
  status text,
  outfit_id uuid,
  created_at timestamptz,
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency_key text :=
    to_char(timezone('UTC', now()), 'YYYY-MM-DD') || ':' || p_source_url;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_requester_hash, 0));

  return query
  select job.id, job.status, job.outfit_id, job.created_at, false
  from public.ingestion_jobs as job
  where job.idempotency_key = v_idempotency_key;
  if found then
    return;
  end if;

  if (
    select count(*)
    from public.ingestion_jobs
    where requester_hash = p_requester_hash
      and created_at >= now() - interval '1 hour'
  ) >= p_hourly_limit then
    raise exception 'rate_limit';
  end if;

  return query
  insert into public.ingestion_jobs (
    idempotency_key,
    source_url,
    requester_hash,
    status
  )
  values (v_idempotency_key, p_source_url, p_requester_hash, 'queued')
  returning
    ingestion_jobs.id,
    ingestion_jobs.status,
    ingestion_jobs.outfit_id,
    ingestion_jobs.created_at,
    true;
end;
$$;

create or replace function public.claim_failed_ingestion_job(p_job_id uuid)
returns table (id uuid, source_url text)
language sql
security definer
set search_path = public
as $$
  update public.ingestion_jobs
  set status = 'queued',
      error_message = null,
      completed_at = null,
      updated_at = now()
  where ingestion_jobs.id = p_job_id
    and ingestion_jobs.status = 'failed'
  returning ingestion_jobs.id, ingestion_jobs.source_url;
$$;

create or replace function public.publish_outfit_result(
  p_job_id uuid,
  p_source jsonb,
  p_analysis jsonb,
  p_product_groups jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ingestion_jobs%rowtype;
  v_source_post_id uuid;
  v_outfit_id uuid;
  v_garment_id uuid;
  v_garment record;
  v_product record;
begin
  select *
  into v_job
  from public.ingestion_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'ingestion_job_not_found';
  end if;
  if v_job.outfit_id is not null then
    update public.ingestion_jobs
    set status = 'complete',
        error_message = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = p_job_id;
    return v_job.outfit_id;
  end if;
  if exists (
    select 1
    from public.takedowns
    where source_url = p_source->>'canonicalUrl'
      and status = 'active'
  ) then
    raise exception 'source_removed';
  end if;

  insert into public.source_posts (
    platform,
    canonical_url,
    caption,
    source_title,
    fetched_at
  )
  values (
    'instagram',
    p_source->>'canonicalUrl',
    p_source->>'caption',
    p_source->>'title',
    now()
  )
  on conflict (canonical_url) do update
  set caption = excluded.caption,
      source_title = excluded.source_title,
      fetched_at = excluded.fetched_at
  returning id into v_source_post_id;

  insert into public.outfits (
    source_post_id,
    title,
    status,
    model_name,
    prompt_version
  )
  values (
    v_source_post_id,
    p_analysis->>'summary',
    'draft',
    p_analysis->>'model',
    p_analysis->>'promptVersion'
  )
  returning id into v_outfit_id;

  for v_garment in
    select value, (ordinality - 1)::integer as position
    from jsonb_array_elements(p_analysis->'garments') with ordinality
  loop
    insert into public.garments (
      outfit_id,
      position,
      category,
      subtype,
      colors,
      materials,
      pattern,
      fit,
      details,
      brand_evidence,
      confidence,
      search_query
    )
    values (
      v_outfit_id,
      v_garment.position,
      v_garment.value->>'category',
      v_garment.value->>'subtype',
      array(select jsonb_array_elements_text(v_garment.value->'colors')),
      array(select jsonb_array_elements_text(v_garment.value->'materials')),
      v_garment.value->>'pattern',
      v_garment.value->>'fit',
      array(select jsonb_array_elements_text(v_garment.value->'details')),
      v_garment.value->>'brandEvidence',
      (v_garment.value->>'confidence')::numeric,
      v_garment.value->>'searchQuery'
    )
    returning id into v_garment_id;

    for v_product in
      select value, (ordinality - 1)::integer as rank
      from jsonb_array_elements(
        coalesce(p_product_groups->v_garment.position, '[]'::jsonb)
      ) with ordinality
    loop
      insert into public.product_matches (
        garment_id,
        provider,
        provider_id,
        title,
        merchant,
        price_text,
        product_url,
        image_url,
        rating,
        rank
      )
      values (
        v_garment_id,
        'searchapi',
        v_product.value->>'providerId',
        v_product.value->>'title',
        v_product.value->>'merchant',
        v_product.value->>'priceText',
        v_product.value->>'productUrl',
        v_product.value->>'imageUrl',
        nullif(v_product.value->>'rating', '')::numeric,
        v_product.rank
      );
    end loop;
  end loop;

  update public.outfits
  set status = 'published',
      published_at = now(),
      updated_at = now()
  where id = v_outfit_id;

  update public.ingestion_jobs
  set status = 'complete',
      outfit_id = v_outfit_id,
      completed_at = now(),
      updated_at = now()
  where id = p_job_id;

  return v_outfit_id;
end;
$$;

revoke all on function public.reserve_ingestion_job(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.claim_failed_ingestion_job(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_outfit_result(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_ingestion_job(text, text, integer)
  to service_role;
grant execute on function public.claim_failed_ingestion_job(uuid)
  to service_role;
grant execute on function public.publish_outfit_result(uuid, jsonb, jsonb, jsonb)
  to service_role;
