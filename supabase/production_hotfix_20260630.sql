-- Production hotfix: reconcile hanging B2C withdrawals.
-- Run this in Supabase SQL Editor, then execute:
--   select * from public.fail_stale_mpesa_withdrawals(interval '2 minutes');

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
      update public.profiles set balance_usd = balance_usd + _tx.amount_usd where id = _tx.user_id;
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _tx.amount_usd where id = _tx.user_id;
    end if;
  end if;

  if _tx.kind = 'withdraw'
     and _tx.status in ('failed', 'cancelled')
     and _status = 'completed' then
    if _tx.account_type = 'real' then
      update public.profiles set balance_usd = greatest(balance_usd - _tx.amount_usd, 0) where id = _tx.user_id;
    else
      update public.profiles set demo_balance_usd = greatest(demo_balance_usd - _tx.amount_usd, 0) where id = _tx.user_id;
    end if;
  end if;

  update public.transactions
  set status = _status, meta = meta || coalesce(_meta, '{}'::jsonb)
  where id = _transaction_id
  returning * into _tx;

  return _tx;
end;
$$;

create or replace function public.fail_stale_mpesa_withdrawals(
  _older_than interval default interval '2 minutes'
)
returns table(transaction_id uuid, user_id uuid, amount numeric, currency text, previous_status public.transaction_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  _row record;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  for _row in
    select t.id, t.user_id, t.amount, t.currency, t.status
    from public.transactions t
    where t.kind = 'withdraw'
      and t.method = 'mpesa'
      and t.status in ('pending', 'processing')
      and t.created_at < now() - _older_than
      and not exists (
        select 1
        from public.daraja_callbacks dc
        where dc.transaction_id = t.id
          and dc.result_code = 0
      )
    order by t.created_at
  loop
    transaction_id := _row.id;
    user_id := _row.user_id;
    amount := _row.amount;
    currency := _row.currency;
    previous_status := _row.status;

    perform public.apply_transaction(
      _row.id,
      'failed',
      jsonb_build_object(
        'auto_failed_reason', 'Safaricom B2C approval timed out without success callback',
        'auto_failed_at', now()
      )
    );

    update public.payment_requests
    set status = 'failed',
        response_payload = response_payload || jsonb_build_object(
          'auto_failed_reason', 'Safaricom B2C approval timed out without success callback',
          'auto_failed_at', now()
        )
    where transaction_id = _row.id
      and request_type = 'b2c'
      and status in ('pending', 'processing');

    return next;
  end loop;
end;
$$;

grant execute on function public.apply_transaction(uuid, public.transaction_status, jsonb)
  to service_role;
grant execute on function public.fail_stale_mpesa_withdrawals(interval)
  to service_role;
revoke execute on function public.fail_stale_mpesa_withdrawals(interval)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
