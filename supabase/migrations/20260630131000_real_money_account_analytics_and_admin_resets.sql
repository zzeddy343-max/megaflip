-- Keep account analytics focused on real money only.
-- Demo balances, virtual credits, demo trades, crypto deposits, and pending deposits
-- must not appear in retained-money reporting.

create or replace view public.agent_rollups
with (security_invoker = true) as
with tx_by_client as (
  select
    user_id,
    coalesce(sum(amount_usd) filter (
      where kind = 'deposit'
        and method = 'mpesa'
        and account_type = 'real'
        and is_virtual = false
        and status = 'completed'
    ), 0) as total_deposits,
    coalesce(sum(amount_usd) filter (
      where kind = 'withdraw'
        and account_type = 'real'
        and is_virtual = false
        and status = 'completed'
    ), 0) as total_withdrawals
  from public.transactions
  group by user_id
),
trade_by_client as (
  select
    user_id,
    coalesce(sum(case when status = 'lost' then stake else 0 end)
           - sum(case when status = 'won' then (payout - stake) else 0 end), 0) as house_retained
  from public.trades
  where account_type = 'real'
    and status <> 'open'
  group by user_id
)
select
  a.id as agent_id,
  a.user_id as agent_user_id,
  a.referral_code,
  a.commission_pct,
  p.username as agent_username,
  count(distinct r.client_id) as client_count,
  coalesce(sum(tx.total_deposits), 0) as total_deposits,
  coalesce(sum(tx.total_withdrawals), 0) as total_withdrawals,
  coalesce(sum(tr.house_retained), 0) as house_retained
from public.agents a
left join public.profiles p on p.id = a.user_id
left join public.referrals r on r.agent_id = a.id
left join tx_by_client tx on tx.user_id = r.client_id
left join trade_by_client tr on tr.user_id = r.client_id
group by a.id, a.user_id, a.referral_code, a.commission_pct, p.username;
