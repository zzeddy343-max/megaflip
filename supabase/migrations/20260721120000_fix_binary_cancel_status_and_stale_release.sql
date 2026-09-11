-- Fix binary cancellation failures caused by stale deployed RPCs using
-- transaction statuses such as "completed" against public.trade_status.

create or replace function public.cancel_open_trade(_trade_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _trade public.trades;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into _trade
  from public.trades
  where id = _trade_id and user_id = auth.uid()
  for update;

  if _trade.id is null then
    raise exception 'Trade not found';
  end if;

  if _trade.status <> 'open' then
    return jsonb_build_object('ok', true, 'payout', _trade.payout, 'status', _trade.status);
  end if;

  update public.trades
  set status = 'cancelled'::public.trade_status,
      payout = _trade.stake,
      closed_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('cancelled_by_user', true)
  where id = _trade_id and user_id = auth.uid() and status = 'open';

  if _trade.account_type = 'real' then
    update public.profiles set balance_usd = balance_usd + _trade.stake where id = auth.uid();
  else
    update public.profiles set demo_balance_usd = demo_balance_usd + _trade.stake where id = auth.uid();
  end if;

  insert into public.transactions (
    user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta
  )
  values (
    auth.uid(),
    'trade_payout',
    'system',
    _trade.account_type,
    _trade.stake,
    'USD',
    _trade.stake,
    'completed'::public.transaction_status,
    _trade.account_type = 'demo',
    jsonb_build_object('trade_id', _trade.id, 'reason', 'cancelled')
  );

  return jsonb_build_object('ok', true, 'payout', _trade.stake, 'status', 'cancelled');
end;
$$;

create or replace function public.release_stale_binary_trades(
  _older_than interval default '60 seconds'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _trade public.trades;
  _released integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  for _trade in
    select *
    from public.trades
    where user_id = auth.uid()
      and module = 'binary'
      and status = 'open'
      and created_at < now() - _older_than
    for update skip locked
  loop
    update public.trades
    set status = 'cancelled'::public.trade_status,
        payout = _trade.stake,
        closed_at = now(),
        meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
          'cancelled_by_system', true,
          'reason', 'stale_binary_timeout'
        )
    where id = _trade.id and status = 'open';

    if _trade.account_type = 'real' then
      update public.profiles set balance_usd = balance_usd + _trade.stake where id = auth.uid();
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _trade.stake where id = auth.uid();
    end if;

    insert into public.transactions (
      user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta
    )
    values (
      auth.uid(),
      'trade_payout',
      'system',
      _trade.account_type,
      _trade.stake,
      'USD',
      _trade.stake,
      'completed'::public.transaction_status,
      _trade.account_type = 'demo',
      jsonb_build_object('trade_id', _trade.id, 'reason', 'stale_binary_timeout')
    );

    _released := _released + 1;
  end loop;

  return jsonb_build_object('ok', true, 'released', _released);
end;
$$;

grant execute on function public.cancel_open_trade(uuid) to authenticated;
grant execute on function public.release_stale_binary_trades(interval) to authenticated;

notify pgrst, 'reload schema';
