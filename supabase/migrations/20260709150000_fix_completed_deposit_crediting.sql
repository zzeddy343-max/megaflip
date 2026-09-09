-- DEPRECATED: See 20260709160000_fix_deposit_double_credit_race_condition.sql for the corrected version
-- This function had a race condition where deposits could be credited twice

-- Keeping this migration for compatibility, but the function is replaced by the new one
-- The issue was that credited_at wasn't set atomically with the balance update

with completed_uncredited_deposits as (
  select id, user_id, account_type, amount_usd, currency, amount
  from public.transactions
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
)
update public.profiles p
set balance_usd = coalesce(p.balance_usd, 0) + coalesce(d.amount_usd, 0),
    balance_ksh = coalesce(p.balance_ksh, 0) + case when d.currency = 'KSH' then coalesce(d.amount, 0) else 0 end
from completed_uncredited_deposits d
where p.id = d.user_id
  and d.account_type = 'real';

with completed_uncredited_deposits as (
  select id, user_id, account_type, amount_usd, currency, amount
  from public.transactions
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
)
update public.profiles p
set demo_balance_usd = coalesce(p.demo_balance_usd, 0) + coalesce(d.amount_usd, 0),
    balance_ksh = coalesce(p.balance_ksh, 0) + case when d.currency = 'KSH' then coalesce(d.amount, 0) else 0 end
from completed_uncredited_deposits d
where p.id = d.user_id
  and d.account_type = 'demo';

update public.transactions
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('credited_at', now(), 'credited_by', 'backfill')
where kind = 'deposit'
  and status = 'completed'
  and coalesce(meta->>'credited_at', '') = '';


with completed_uncredited_deposits as (
  select id, user_id, account_type, amount_usd, currency, amount
  from public.transactions
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
)
update public.profiles p
set balance_usd = coalesce(p.balance_usd, 0) + coalesce(d.amount_usd, 0),
    balance_ksh = coalesce(p.balance_ksh, 0) + case when d.currency = 'KSH' then coalesce(d.amount, 0) else 0 end
from completed_uncredited_deposits d
where p.id = d.user_id
  and d.account_type = 'real';

with completed_uncredited_deposits as (
  select id, user_id, account_type, amount_usd, currency, amount
  from public.transactions
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
)
update public.profiles p
set demo_balance_usd = coalesce(p.demo_balance_usd, 0) + coalesce(d.amount_usd, 0),
    balance_ksh = coalesce(p.balance_ksh, 0) + case when d.currency = 'KSH' then coalesce(d.amount, 0) else 0 end
from completed_uncredited_deposits d
where p.id = d.user_id
  and d.account_type = 'demo';

update public.transactions
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('credited_at', now(), 'credited_by', 'backfill')
where kind = 'deposit'
  and status = 'completed'
  and coalesce(meta->>'credited_at', '') = '';

grant execute on function public.apply_transaction(uuid, public.transaction_status, jsonb)
  to service_role;

notify pgrst, 'reload schema';
