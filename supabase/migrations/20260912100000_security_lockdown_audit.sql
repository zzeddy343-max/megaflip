-- Security lockdown:
-- * demo balances can never be withdrawn;
-- * admin and agent accounts can never create or receive a withdrawal payout;
-- * all high-risk activity is recorded in an immutable audit stream;
-- * pending internal withdrawals from before this migration are cancelled and refunded.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_idx on public.audit_events(created_at desc);
create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id, created_at desc);

alter table public.audit_events enable row level security;
drop policy if exists "admins read audit events" on public.audit_events;
create policy "admins read audit events" on public.audit_events
  for select using (public.has_role(auth.uid(), 'admin'));
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

create or replace function public.log_security_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor uuid := auth.uid();
  _entity uuid;
  _kind text;
begin
  if tg_table_name = 'user_roles' then
    _entity := coalesce(new.user_id, old.user_id);
    _kind := case when tg_op = 'DELETE' then 'role_removed' else 'role_granted' end;
  elsif tg_table_name = 'transactions' then
    _entity := coalesce(new.user_id, old.user_id);
    _kind := case when tg_op = 'INSERT' then 'transaction_created' else 'transaction_updated' end;
  else
    _entity := coalesce(new.id, old.id);
    _kind := case when tg_op = 'INSERT' then tg_table_name || '_created' else tg_table_name || '_updated' end;
  end if;

  insert into public.audit_events(actor_user_id, event_type, entity_type, entity_id, details)
  values (_actor, _kind, tg_table_name, _entity,
    jsonb_build_object('operation', tg_op, 'new', to_jsonb(new), 'old', to_jsonb(old)));
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_user_roles_changes on public.user_roles;
create trigger audit_user_roles_changes after insert or update or delete on public.user_roles
for each row execute function public.log_security_event();

drop trigger if exists audit_transaction_changes on public.transactions;
create trigger audit_transaction_changes after insert or update or delete on public.transactions
for each row execute function public.log_security_event();

drop trigger if exists audit_profile_changes on public.profiles;
create trigger audit_profile_changes after insert or update or delete on public.profiles
for each row execute function public.log_security_event();

create or replace function public.block_restricted_withdrawals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'withdraw' and new.account_type = 'demo' then
    raise exception 'Demo funds cannot be withdrawn.';
  end if;

  if new.kind = 'withdraw' and exists (
    select 1 from public.user_roles
    where user_id = new.user_id and role in ('admin', 'agent')
  ) then
    raise exception 'Withdrawals are disabled for admin and agent accounts.';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_block_restricted_withdrawals on public.transactions;
create trigger transactions_block_restricted_withdrawals
before insert or update of kind, account_type, user_id on public.transactions
for each row execute function public.block_restricted_withdrawals();

-- Refund reservations made by the old pending-withdrawal flow for internal users.
do $$
declare r record;
begin
  for r in
    select t.id, t.user_id, t.amount_usd
    from public.transactions t
    where t.kind = 'withdraw'
      and t.account_type = 'real'
      and t.status in ('pending', 'processing')
      and exists (select 1 from public.user_roles ur where ur.user_id = t.user_id and ur.role in ('admin', 'agent'))
  loop
    update public.profiles
      set balance_usd = balance_usd + r.amount_usd, updated_at = now()
      where id = r.user_id;
    update public.transactions
      set status = 'cancelled',
          meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
            'security_lockdown', true,
            'payout_suppressed_reason', 'admin_or_agent_withdrawals_disabled',
            'cancelled_at', now())
      where id = r.id;
  end loop;
end $$;

-- Also contain already-pending withdrawals with no completed deposit and no
-- real trade history. Restore any reservation before cancelling the request.
do $$
declare r record;
begin
  for r in
    select t.id, t.user_id, t.amount_usd
    from public.transactions t
    where t.kind = 'withdraw'
      and t.account_type = 'real'
      and t.status in ('pending', 'processing')
      and not exists (
        select 1 from public.transactions d
        where d.user_id = t.user_id and d.kind = 'deposit'
          and d.account_type = 'real' and d.status = 'completed' and d.is_virtual = false
      )
      and not exists (select 1 from public.trades tr where tr.user_id = t.user_id and tr.account_type = 'real')
  loop
    update public.profiles
      set balance_usd = balance_usd + r.amount_usd,
          account_state = 'frozen',
          freeze_until = null,
          moderation_note = 'Automatic fraud hold: pending withdrawal had no deposit or trade history.',
          updated_at = now()
      where id = r.user_id;
    update public.transactions
      set status = 'cancelled',
          meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
            'security_lockdown', true,
            'payout_suppressed_reason', 'no_deposit_or_trade_history',
            'cancelled_at', now())
      where id = r.id;
    insert into public.audit_events(actor_user_id, event_type, entity_type, entity_id, details)
      values (null, 'suspicious_withdrawal_frozen', 'user', r.user_id,
        jsonb_build_object('transaction_id', r.id, 'reason', 'no_deposit_or_trade_history'));
  end loop;
end $$;

notify pgrst, 'reload schema';
