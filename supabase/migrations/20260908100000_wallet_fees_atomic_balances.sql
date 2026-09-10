-- Configurable wallet fees and concurrency-safe balance updates.

alter table public.system_settings
  add column if not exists deposit_fee_pct numeric(7,4) not null default 5,
  add column if not exists withdrawal_fee_pct numeric(7,4) not null default 5;

update public.system_settings
set deposit_fee_pct = coalesce(deposit_fee_pct, 5),
    withdrawal_fee_pct = coalesce(withdrawal_fee_pct, withdrawal_tax_pct, 5)
where id = 'default';

create index if not exists transactions_kind_status_created_idx
  on public.transactions(kind, status, created_at desc);
create index if not exists transactions_account_status_idx
  on public.transactions(account_type, status, created_at desc);

create or replace function public.adjust_wallet_balance(
  _user_id uuid,
  _account_type public.account_type,
  _usd_delta numeric,
  _ksh_delta numeric default 0
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  _profile public.profiles;
begin
  if current_setting('role', true) <> 'service_role' and auth.uid() <> _user_id then
    raise exception 'Unauthorized';
  end if;

  select * into _profile from public.profiles where id = _user_id for update;
  if _profile.id is null then raise exception 'Profile not found'; end if;

  if _account_type = 'real' then
    if _profile.balance_usd + _usd_delta < 0 then raise exception 'Insufficient balance'; end if;
    update public.profiles
    set balance_usd = balance_usd + _usd_delta,
        balance_ksh = balance_ksh + _ksh_delta,
        updated_at = now()
    where id = _user_id
    returning * into _profile;
  else
    if _profile.demo_balance_usd + _usd_delta < 0 then raise exception 'Insufficient balance'; end if;
    update public.profiles
    set demo_balance_usd = demo_balance_usd + _usd_delta,
        balance_ksh = balance_ksh + _ksh_delta,
        updated_at = now()
    where id = _user_id
    returning * into _profile;
  end if;

  return _profile;
end;
$$;

revoke all on function public.adjust_wallet_balance(uuid, public.account_type, numeric, numeric) from public;
grant execute on function public.adjust_wallet_balance(uuid, public.account_type, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
