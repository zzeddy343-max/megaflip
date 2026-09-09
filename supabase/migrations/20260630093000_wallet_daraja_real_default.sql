-- Wallet/Daraja repair:
-- - Real account is the default active account.
-- - Demo account starts at 10000 USD.
-- - Failed/cancelled withdrawals refund the reserved balance.

alter table public.profiles
  alter column active_account set default 'real';

update public.profiles
set active_account = 'real'
where active_account is null or active_account = 'demo';

update public.profiles
set demo_balance_usd = 10000.00
where demo_balance_usd is null or demo_balance_usd <= 0;

create or replace function public.apply_transaction(
  _transaction_id uuid,
  _status public.transaction_status,
  _meta jsonb default '{}'::jsonb
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  _tx public.transactions;
begin
  if auth.uid() is null and current_setting('role', true) <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select * into _tx
  from public.transactions
  where id = _transaction_id
  for update;

  if _tx.id is null then
    raise exception 'Transaction not found';
  end if;

  if _tx.status <> 'completed' and _status = 'completed' and _tx.kind = 'deposit' then
    if _tx.account_type = 'real' then
      update public.profiles
      set balance_usd = balance_usd + _tx.amount_usd,
          balance_ksh = balance_ksh + case when _tx.currency = 'KSH' then _tx.amount else 0 end
      where id = _tx.user_id;
    else
      update public.profiles
      set demo_balance_usd = demo_balance_usd + _tx.amount_usd,
          balance_ksh = balance_ksh + case when _tx.currency = 'KSH' then _tx.amount else 0 end
      where id = _tx.user_id;
    end if;
  end if;

  if _tx.kind = 'withdraw'
     and _tx.status not in ('failed', 'cancelled')
     and _status in ('failed', 'cancelled') then
    if _tx.account_type = 'real' then
      update public.profiles
      set balance_usd = balance_usd + _tx.amount_usd
      where id = _tx.user_id;
    else
      update public.profiles
      set demo_balance_usd = demo_balance_usd + _tx.amount_usd
      where id = _tx.user_id;
    end if;
  end if;

  update public.transactions
  set status = _status, meta = meta || coalesce(_meta, '{}'::jsonb)
  where id = _transaction_id
  returning * into _tx;

  return _tx;
end;
$$;

grant execute on function public.apply_transaction(uuid, public.transaction_status, jsonb)
  to service_role;

notify pgrst, 'reload schema';
