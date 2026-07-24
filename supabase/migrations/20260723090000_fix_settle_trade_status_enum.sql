-- Force binary cancel/settlement RPCs to use public.trade_status values for
-- trades and public.transaction_status values for ledger rows. Some deployed
-- databases still have older RPC bodies that write "completed" into
-- trades.status, which is invalid for public.trade_status.

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

create or replace function public.settle_trade(
  _trade_id uuid,
  _won boolean,
  _exit_price numeric default null,
  _multiplier numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _trade public.trades;
  _payout numeric;
  _effective_multiplier numeric;
  _next_status public.trade_status;
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
    return jsonb_build_object(
      'ok', true,
      'payout', _trade.payout,
      'status', _trade.status,
      'exit_price', _trade.exit_price
    );
  end if;

  _effective_multiplier := coalesce(
    _multiplier,
    case
      when _trade.module = 'binary' and _trade.meta ->> 'type' in ('Buy/Sell', 'Even/Odd') then 1.70
      when _trade.module = 'binary' and _trade.meta ->> 'type' = 'Matches/Differs' and upper(_trade.direction) = 'MATCH' then 5.00
      when _trade.module = 'binary' and _trade.meta ->> 'type' = 'Matches/Differs' and upper(_trade.direction) = 'DIFFER' then 1.06
      else 1.20
    end
  );

  _payout := case when _won then round((_trade.stake * _effective_multiplier)::numeric, 2) else 0 end;
  _next_status := case when _won then 'won'::public.trade_status else 'lost'::public.trade_status end;

  update public.trades
  set status = _next_status,
      exit_price = _exit_price,
      payout = _payout,
      closed_at = now()
  where id = _trade_id and user_id = auth.uid() and status = 'open';

  if _payout > 0 then
    if _trade.account_type = 'real' then
      update public.profiles set balance_usd = balance_usd + _payout where id = auth.uid();
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _payout where id = auth.uid();
    end if;

    insert into public.transactions (
      user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta
    )
    values (
      auth.uid(),
      'trade_payout',
      'system',
      _trade.account_type,
      _payout,
      'USD',
      _payout,
      'completed'::public.transaction_status,
      _trade.account_type = 'demo',
      jsonb_build_object('trade_id', _trade.id, 'reason', 'settlement')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'payout', _payout,
    'status', _next_status,
    'exit_price', _exit_price
  );
end;
$$;

grant execute on function public.settle_trade(uuid, boolean, numeric, numeric) to authenticated;

create or replace function public.admin_settle_open_trade(
  _user_id uuid,
  _trade_id uuid,
  _won boolean,
  _exit_price numeric default null,
  _multiplier numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _trade public.trades;
  _payout numeric;
  _effective_multiplier numeric;
  _next_status public.trade_status;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select * into _trade
  from public.trades
  where id = _trade_id and user_id = _user_id
  for update;

  if _trade.id is null then
    raise exception 'Trade not found';
  end if;

  if _trade.status <> 'open' then
    return jsonb_build_object(
      'ok', true,
      'payout', _trade.payout,
      'status', _trade.status,
      'exit_price', coalesce(_trade.exit_price, _exit_price)
    );
  end if;

  _effective_multiplier := coalesce(_multiplier, 1.95);
  _payout := case when _won then round((_trade.stake * _effective_multiplier)::numeric, 2) else 0 end;
  _next_status := case when _won then 'won'::public.trade_status else 'lost'::public.trade_status end;

  update public.trades
  set status = _next_status,
      exit_price = _exit_price,
      payout = _payout,
      closed_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('settled_by_admin_fallback', true)
  where id = _trade_id and user_id = _user_id and status = 'open';

  if _payout > 0 then
    if _trade.account_type = 'real' then
      update public.profiles set balance_usd = balance_usd + _payout where id = _user_id;
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _payout where id = _user_id;
    end if;

    insert into public.transactions (
      user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta
    )
    values (
      _user_id,
      'trade_payout',
      'system',
      _trade.account_type,
      _payout,
      'USD',
      _payout,
      'completed'::public.transaction_status,
      _trade.account_type = 'demo',
      jsonb_build_object('trade_id', _trade.id, 'reason', 'admin_settle_fallback')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'payout', _payout,
    'status', _next_status,
    'exit_price', _exit_price
  );
end;
$$;

revoke all on function public.admin_settle_open_trade(uuid, uuid, boolean, numeric, numeric) from public;
grant execute on function public.admin_settle_open_trade(uuid, uuid, boolean, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
