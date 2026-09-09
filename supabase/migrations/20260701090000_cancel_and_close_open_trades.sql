-- Allow users to cancel not-yet-launched bets and close forex/crypto positions at live P/L.

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
  where id = _trade_id;

  if _trade.account_type = 'real' then
    update public.profiles set balance_usd = balance_usd + _trade.stake where id = auth.uid();
  else
    update public.profiles set demo_balance_usd = demo_balance_usd + _trade.stake where id = auth.uid();
  end if;

  insert into public.transactions (user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta)
  values (auth.uid(), 'trade_payout', 'system', _trade.account_type, _trade.stake, 'USD', _trade.stake, 'completed', _trade.account_type = 'demo', jsonb_build_object('trade_id', _trade.id, 'reason', 'cancelled'));

  return jsonb_build_object('ok', true, 'payout', _trade.stake, 'status', 'cancelled');
end;
$$;

create or replace function public.close_trade_at_price(
  _trade_id uuid,
  _exit_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _trade public.trades;
  _direction text;
  _pnl numeric := 0;
  _payout numeric;
  _pip numeric;
  _lot numeric;
  _leverage numeric;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if _exit_price is null or _exit_price <= 0 then
    raise exception 'Exit price must be positive';
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
  if _trade.module not in ('forex', 'crypto') then
    raise exception 'Only forex and crypto positions can be closed manually';
  end if;
  if _trade.entry_price is null or _trade.entry_price <= 0 then
    raise exception 'Trade entry price is missing';
  end if;

  _direction := upper(_trade.direction);

  if _trade.module = 'forex' then
    _pip := case when position('JPY' in _trade.market) > 0 then 0.01 else 0.0001 end;
    _lot := coalesce(nullif((_trade.meta ->> 'lot')::numeric, 0), greatest(_trade.stake / 100, 0.01));
    _pnl := (case when _direction = 'BUY' then _exit_price - _trade.entry_price else _trade.entry_price - _exit_price end) / _pip * _lot * 10;
  else
    _leverage := coalesce(nullif((_trade.meta ->> 'leverage')::numeric, 0), 1);
    _pnl := (case when _direction in ('LONG', 'BUY') then _exit_price - _trade.entry_price else _trade.entry_price - _exit_price end) / _trade.entry_price * _trade.stake * _leverage;
  end if;

  _payout := greatest(round((_trade.stake + _pnl)::numeric, 2), 0);

  update public.trades
  set status = 'closed'::public.trade_status,
      exit_price = _exit_price,
      payout = _payout,
      closed_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('closed_by_user', true, 'pnl_usd', round(_pnl::numeric, 2))
  where id = _trade_id;

  if _payout > 0 then
    if _trade.account_type = 'real' then
      update public.profiles set balance_usd = balance_usd + _payout where id = auth.uid();
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _payout where id = auth.uid();
    end if;

    insert into public.transactions (user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta)
    values (auth.uid(), 'trade_payout', 'system', _trade.account_type, _payout, 'USD', _payout, 'completed', _trade.account_type = 'demo', jsonb_build_object('trade_id', _trade.id, 'reason', 'manual_close', 'pnl_usd', round(_pnl::numeric, 2)));
  end if;

  return jsonb_build_object('ok', true, 'payout', _payout, 'pnl', round(_pnl::numeric, 2), 'status', 'closed');
end;
$$;

grant execute on function public.cancel_open_trade(uuid) to authenticated;
grant execute on function public.close_trade_at_price(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
