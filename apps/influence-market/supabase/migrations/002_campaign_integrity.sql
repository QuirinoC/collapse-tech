-- Additive upgrade for deployments that already applied 001_initial.sql.
alter table public.campaigns
  add column if not exists brand_name text;

alter table public.assignments
  add column if not exists notes text;

alter table public.leads
  add column if not exists company text;

alter table public.ledger_entries
  add column if not exists operation_key text;

create unique index if not exists ledger_operation_key_idx
  on public.ledger_entries(operation_key);

create or replace function public.accept_campaign_application(
  p_campaign_id uuid,
  p_application_id uuid,
  p_creator_id uuid,
  p_assignment_id uuid,
  p_decided_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_campaign public.campaigns%rowtype;
  accepted_application public.applications%rowtype;
  created_assignment public.assignments%rowtype;
begin
  update public.campaigns
  set slots_remaining = slots_remaining - 1
  where id = p_campaign_id
    and status = 'open'
    and payment_status = 'unpaid'
    and slots_remaining > 0
  returning * into accepted_campaign;

  if not found then
    raise exception 'application cannot be accepted';
  end if;

  update public.applications
  set status = 'accepted', decided_at = p_decided_at
  where id = p_application_id
    and campaign_id = p_campaign_id
    and creator_id = p_creator_id
    and status = 'pending'
  returning * into accepted_application;

  if not found then
    raise exception 'application cannot be accepted';
  end if;

  insert into public.assignments (
    id,
    campaign_id,
    creator_id,
    status,
    content_url,
    submitted_at,
    reviewed_at,
    paid_at,
    payout_ref,
    notes
  )
  values (
    p_assignment_id,
    p_campaign_id,
    p_creator_id,
    'instructions_sent',
    null,
    null,
    null,
    null,
    null,
    null
  )
  returning * into created_assignment;

  return jsonb_build_object(
    'campaign', to_jsonb(accepted_campaign),
    'application', to_jsonb(accepted_application),
    'assignment', to_jsonb(created_assignment)
  );
end;
$$;

revoke all on function public.accept_campaign_application(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.accept_campaign_application(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) to service_role;

create or replace function public.finalize_campaign_funding(
  p_campaign_id uuid,
  p_claim_ref text,
  p_provider_ref text,
  p_funded_at timestamptz,
  p_charge_id uuid,
  p_charge_amount_cents integer,
  p_charge_operation_key text,
  p_charge_memo text,
  p_fee_id uuid,
  p_fee_amount_cents integer,
  p_fee_operation_key text,
  p_fee_memo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  funded_campaign public.campaigns%rowtype;
  stored_charge public.ledger_entries%rowtype;
  stored_fee public.ledger_entries%rowtype;
begin
  update public.campaigns
  set status = 'funded',
      payment_status = 'held',
      funded_at = p_funded_at,
      payment_ref = p_provider_ref
  where id = p_campaign_id
    and status = 'open'
    and payment_status = 'unpaid'
    and payment_ref = p_claim_ref
  returning * into funded_campaign;

  if not found then
    select *
    into funded_campaign
    from public.campaigns
    where id = p_campaign_id
      and status = 'funded'
      and payment_status = 'held'
      and payment_ref = p_provider_ref;

    if not found then
      raise exception 'campaign funding cannot be finalized';
    end if;
  end if;

  insert into public.ledger_entries (
    id,
    campaign_id,
    assignment_id,
    kind,
    amount_cents,
    provider_ref,
    operation_key,
    memo
  )
  values (
    p_charge_id,
    p_campaign_id,
    null,
    'charge',
    p_charge_amount_cents,
    p_provider_ref,
    p_charge_operation_key,
    p_charge_memo
  )
  on conflict (operation_key) do nothing;

  select *
  into stored_charge
  from public.ledger_entries
  where operation_key = p_charge_operation_key;

  if stored_charge.campaign_id <> p_campaign_id
    or stored_charge.kind <> 'charge'
    or stored_charge.amount_cents <> p_charge_amount_cents
    or stored_charge.provider_ref <> p_provider_ref then
    raise exception 'charge operation key conflicts with existing ledger data';
  end if;

  insert into public.ledger_entries (
    id,
    campaign_id,
    assignment_id,
    kind,
    amount_cents,
    provider_ref,
    operation_key,
    memo
  )
  values (
    p_fee_id,
    p_campaign_id,
    null,
    'platform_fee',
    p_fee_amount_cents,
    p_provider_ref,
    p_fee_operation_key,
    p_fee_memo
  )
  on conflict (operation_key) do nothing;

  select *
  into stored_fee
  from public.ledger_entries
  where operation_key = p_fee_operation_key;

  if stored_fee.campaign_id <> p_campaign_id
    or stored_fee.kind <> 'platform_fee'
    or stored_fee.amount_cents <> p_fee_amount_cents
    or stored_fee.provider_ref <> p_provider_ref then
    raise exception 'fee operation key conflicts with existing ledger data';
  end if;

  return to_jsonb(funded_campaign);
end;
$$;

revoke all on function public.finalize_campaign_funding(
  uuid,
  text,
  text,
  timestamptz,
  uuid,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.finalize_campaign_funding(
  uuid,
  text,
  text,
  timestamptz,
  uuid,
  integer,
  text,
  text,
  uuid,
  integer,
  text,
  text
) to service_role;

create or replace function public.finalize_assignment_payout(
  p_assignment_id uuid,
  p_campaign_id uuid,
  p_provider_ref text,
  p_paid_at timestamptz,
  p_notes text,
  p_ledger_id uuid,
  p_amount_cents integer,
  p_operation_key text,
  p_memo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  paid_assignment public.assignments%rowtype;
  stored_payout public.ledger_entries%rowtype;
begin
  update public.assignments
  set status = 'paid',
      paid_at = p_paid_at,
      payout_ref = p_provider_ref,
      notes = p_notes,
      updated_at = now()
  where id = p_assignment_id
    and campaign_id = p_campaign_id
    and status = 'approved'
  returning * into paid_assignment;

  if not found then
    select *
    into paid_assignment
    from public.assignments
    where id = p_assignment_id
      and campaign_id = p_campaign_id
      and status = 'paid'
      and payout_ref = p_provider_ref;

    if not found then
      raise exception 'creator payout cannot be finalized';
    end if;
  end if;

  insert into public.ledger_entries (
    id,
    campaign_id,
    assignment_id,
    kind,
    amount_cents,
    provider_ref,
    operation_key,
    memo
  )
  values (
    p_ledger_id,
    p_campaign_id,
    p_assignment_id,
    'payout',
    p_amount_cents,
    p_provider_ref,
    p_operation_key,
    p_memo
  )
  on conflict (operation_key) do nothing;

  select *
  into stored_payout
  from public.ledger_entries
  where operation_key = p_operation_key;

  if stored_payout.campaign_id <> p_campaign_id
    or stored_payout.assignment_id <> p_assignment_id
    or stored_payout.kind <> 'payout'
    or stored_payout.amount_cents <> p_amount_cents
    or stored_payout.provider_ref <> p_provider_ref then
    raise exception 'payout operation key conflicts with existing ledger data';
  end if;

  update public.campaigns
  set status = 'completed', payment_status = 'settled'
  where id = p_campaign_id
    and status = 'funded'
    and (
      select count(*)
      from public.assignments
      where campaign_id = p_campaign_id
    ) = public.campaigns.slots
    and not exists (
      select 1
      from public.assignments
      where campaign_id = p_campaign_id
        and status not in ('paid', 'declined')
    );

  return to_jsonb(paid_assignment);
end;
$$;

revoke all on function public.finalize_assignment_payout(
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  uuid,
  integer,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.finalize_assignment_payout(
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  uuid,
  integer,
  text,
  text
) to service_role;
