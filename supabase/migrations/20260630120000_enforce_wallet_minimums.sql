-- Enforce wallet minimums at the RPC layer for existing deployments.

create or replace function public.create_transaction(
  _kind public.transaction_kind,
  _method public.payment_method,
  _amount numeric,
  _currency text,
  _account public.account_type,
  _phone text default null,
  _meta jsonb default '{}'::jsonb,
  _provider_reference text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  _tx public.transactions;
  _amount_usd numeric;
  _virtual boolean;
  _balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if _amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if _kind not in ('deposit', 'withdraw') then
    raise exception 'Unsupported transaction kind';
  end if;

  _amount_usd := case
    when upper(_currency) = 'KSH' then round((_amount / 130.0)::numeric, 2)
    else round(_amount::numeric, 2)
  end;
  if _kind = 'deposit' and _amount_usd < 3 then
    raise exception 'Minimum deposit is $3';
  end if;
  if _kind = 'withdraw' and _amount_usd < 1 then
    raise exception 'Minimum withdrawal is $1';
  end if;
  _virtual := _account = 'demo';

  if _kind = 'withdraw' then
    select case when _account = 'real' then balance_usd else demo_balance_usd end
    into _balance
    from public.profiles
    where id = auth.uid()
    for update;

    if _balance < _amount_usd then
      raise exception 'Insufficient balance';
    end if;

    if _account = 'real' then
      update public.profiles set balance_usd = balance_usd - _amount_usd where id = auth.uid();
    else
      update public.profiles set demo_balance_usd = demo_balance_usd - _amount_usd where id = auth.uid();
    end if;
  end if;

  insert into public.transactions (
    user_id, kind, method, account_type, amount, currency, amount_usd, status,
    provider_reference, is_virtual, meta
  ) values (
    auth.uid(), _kind, _method, _account, _amount, upper(_currency), _amount_usd,
    case
      when _virtual or _method <> 'mpesa' then 'completed'::public.transaction_status
      else 'pending'::public.transaction_status
    end,
    _provider_reference, _virtual, coalesce(_meta, '{}'::jsonb) || jsonb_build_object('phone', _phone)
  )
  returning * into _tx;

  if _kind = 'deposit' and (_virtual or _method <> 'mpesa') then
    if _account = 'real' then
      update public.profiles
      set balance_usd = balance_usd + _amount_usd,
          balance_ksh = balance_ksh + case when upper(_currency) = 'KSH' then _amount else 0 end
      where id = auth.uid();
    else
      update public.profiles
      set demo_balance_usd = demo_balance_usd + _amount_usd,
          balance_ksh = balance_ksh + case when upper(_currency) = 'KSH' then _amount else 0 end
      where id = auth.uid();
    end if;
  end if;

  return _tx;
end;
$$;

grant execute on function public.create_transaction(
  public.transaction_kind,
  public.payment_method,
  numeric,
  text,
  public.account_type,
  text,
  jsonb,
  text
) to authenticated;

notify pgrst, 'reload schema';
