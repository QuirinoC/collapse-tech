-- Browser sessions store SHA-256 token hashes. Invalidate legacy plaintext
-- sessions during rollout because their original browser token cannot be derived.
delete from public.sessions;

alter table public.assignments add column payout_cents integer;

-- Preserve the payout amount recorded for existing assignments. New
-- assignments are validated against a deterministic remainder allocation in
-- the acceptance function below.
update public.assignments as assignment
set payout_cents = campaign.per_creator_cents
from public.campaigns as campaign
where campaign.id = assignment.campaign_id
  and assignment.payout_cents is null;

alter table public.assignments alter column payout_cents set not null;
alter table public.assignments
  add constraint assignments_payout_cents_positive check (payout_cents > 0);

-- This application authenticates requests in its server routes and uses the
-- service role only there. Deny direct PostgREST access to every exposed table.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.campaigns enable row level security;
alter table public.applications enable row level security;
alter table public.assignments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.leads enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.campaigns from anon, authenticated;
revoke all on table public.applications from anon, authenticated;
revoke all on table public.assignments from anon, authenticated;
revoke all on table public.ledger_entries from anon, authenticated;
revoke all on table public.leads from anon, authenticated;

drop function public.accept_campaign_application(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
);

create function public.accept_campaign_application(
  p_campaign_id uuid,
  p_application_id uuid,
  p_creator_id uuid,
  p_assignment_id uuid,
  p_decided_at timestamptz,
  p_payout_cents integer
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
  committed_payout_cents integer;
  expected_payout_cents integer;
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

  select coalesce(sum(assignment.payout_cents), 0)
  into committed_payout_cents
  from public.assignments as assignment
  where assignment.campaign_id = p_campaign_id;

  expected_payout_cents := (
    accepted_campaign.budget_cents -
    accepted_campaign.fee_cents -
    committed_payout_cents +
    accepted_campaign.slots_remaining
  ) / (accepted_campaign.slots_remaining + 1);

  if p_payout_cents is distinct from expected_payout_cents then
    raise exception 'assignment payout does not match the remaining campaign pool';
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
    notes,
    payout_cents
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
    null,
    p_payout_cents
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
  timestamptz,
  integer
) from public, anon, authenticated;

grant execute on function public.accept_campaign_application(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  integer
) to service_role;
