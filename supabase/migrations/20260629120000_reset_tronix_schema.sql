-- Destructive app-schema rebuild for Supabase.
-- Apply to a fresh project with `supabase db reset`, or to an existing project only
-- after backing up production data.

create extension if not exists pgcrypto;

drop view if exists public.agent_rollups cascade;

do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists on_auth_user_created on auth.users;
  end if;
  if to_regclass('public.profiles') is not null then
    drop trigger if exists trg_profiles_updated on public.profiles;
    drop trigger if exists profiles_touch on public.profiles;
  end if;
  if to_regclass('public.user_settings') is not null then
    drop trigger if exists settings_touch on public.user_settings;
  end if;
  if to_regclass('public.transactions') is not null then
    drop trigger if exists trg_tx_updated on public.transactions;
    drop trigger if exists transactions_touch on public.transactions;
  end if;
  if to_regclass('public.withdrawal_requests') is not null then
    drop trigger if exists trg_wr_touch on public.withdrawal_requests;
  end if;
  if to_regclass('public.payment_requests') is not null then
    drop trigger if exists payment_requests_touch on public.payment_requests;
  end if;
end $$;

drop table if exists public.withdrawal_requests cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_updated_at() cascade;

do $$
begin
  if to_regtype('public.app_role') is not null then
    drop function if exists public.has_role(uuid, public.app_role) cascade;
  end if;
  if to_regtype('public.account_type') is not null then
    drop function if exists public.set_active_account(public.account_type) cascade;
  end if;
  drop function if exists public.reset_demo_account() cascade;
  if to_regtype('public.trade_module') is not null then
    drop function if exists public.place_trade(public.trade_module, text, text, numeric, numeric, jsonb) cascade;
  end if;
  drop function if exists public.settle_trade(uuid, boolean, numeric, numeric) cascade;
  if to_regtype('public.transaction_kind') is not null
    and to_regtype('public.payment_method') is not null
    and to_regtype('public.account_type') is not null then
    drop function if exists public.create_transaction(public.transaction_kind, public.payment_method, numeric, text, public.account_type, text, jsonb, text) cascade;
  end if;
  if to_regtype('public.transaction_status') is not null then
    drop function if exists public.apply_transaction(uuid, public.transaction_status, jsonb) cascade;
  end if;
end $$;

drop table if exists public.daraja_callbacks cascade;
drop table if exists public.payment_requests cascade;
drop table if exists public.kyc_documents cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.polymarket_events cascade;
drop table if exists public.referrals cascade;
drop table if exists public.agents cascade;
drop table if exists public.transactions cascade;
drop table if exists public.trades cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.profiles cascade;

drop type if exists public.app_role cascade;
drop type if exists public.account_type cascade;
drop type if exists public.trade_module cascade;
drop type if exists public.trade_status cascade;
drop type if exists public.transaction_kind cascade;
drop type if exists public.transaction_status cascade;
drop type if exists public.payment_method cascade;
drop type if exists public.kyc_status cascade;

create type public.app_role as enum ('admin', 'agent', 'client');
create type public.account_type as enum ('real', 'demo');
create type public.trade_module as enum ('forex', 'binary', 'aviator', 'predict', 'crypto');
create type public.trade_status as enum ('open', 'won', 'lost', 'closed', 'cancelled');
create type public.transaction_kind as enum ('deposit', 'withdraw', 'trade_stake', 'trade_payout', 'demo_reset', 'admin_credit', 'admin_debit');
create type public.transaction_status as enum ('pending', 'processing', 'completed', 'failed', 'cancelled');
create type public.payment_method as enum ('mpesa', 'crypto', 'system');
create type public.kyc_status as enum ('not_started', 'pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  full_name text,
  phone text,
  balance_usd numeric(18,2) not null default 0 check (balance_usd >= 0),
  demo_balance_usd numeric(18,2) not null default 10000.00 check (demo_balance_usd >= 0),
  balance_ksh numeric(18,2) not null default 0 check (balance_ksh >= 0),
  active_account public.account_type not null default 'real',
  kyc_status public.kyc_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  locale text not null default 'en',
  currency text not null default 'USD',
  notifications jsonb not null default '{"email": true, "push": false}'::jsonb,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_type public.account_type not null default 'demo',
  module public.trade_module not null,
  market text not null,
  direction text not null,
  stake numeric(18,2) not null check (stake > 0),
  entry_price numeric(18,5),
  exit_price numeric(18,5),
  payout numeric(18,2) not null default 0 check (payout >= 0),
  status public.trade_status not null default 'open',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.transaction_kind not null,
  method public.payment_method not null default 'system',
  account_type public.account_type not null default 'demo',
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'USD',
  amount_usd numeric(18,2) not null check (amount_usd >= 0),
  status public.transaction_status not null default 'pending',
  provider_reference text,
  is_virtual boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  provider text not null default 'daraja',
  request_type text not null check (request_type in ('stk_push', 'b2c')),
  phone text,
  checkout_request_id text,
  conversation_id text,
  originator_conversation_id text,
  status public.transaction_status not null default 'pending',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daraja_callbacks (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  callback_type text not null,
  checkout_request_id text,
  conversation_id text,
  result_code integer,
  result_description text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  referral_code text not null unique,
  commission_pct numeric(5,2) not null default 10.00 check (commission_pct >= 0 and commission_pct <= 100),
  created_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade unique,
  agent_id uuid references public.agents(id) on delete set null,
  referral_code text,
  created_at timestamptz not null default now()
);

create table public.polymarket_events (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text not null default 'General',
  yes_price numeric(8,2) not null default 50.00,
  no_price numeric(8,2) not null default 50.00,
  volume_usd numeric(18,2) not null default 0,
  ends_at timestamptz not null,
  resolved boolean not null default false,
  outcome text check (outcome in ('yes', 'no', 'void')),
  created_at timestamptz not null default now()
);

create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  status public.kyc_status not null default 'pending',
  reviewer_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index profiles_email_idx on public.profiles(email);
create index trades_user_status_idx on public.trades(user_id, status, created_at desc);
create index transactions_user_created_idx on public.transactions(user_id, created_at desc);
create index payment_requests_transaction_idx on public.payment_requests(transaction_id);
create index payment_requests_checkout_idx on public.payment_requests(checkout_request_id);
create index referrals_agent_idx on public.referrals(agent_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger settings_touch before update on public.user_settings
for each row execute function public.touch_updated_at();

create trigger transactions_touch before update on public.transactions
for each row execute function public.touch_updated_at();

create trigger payment_requests_touch before update on public.payment_requests
for each row execute function public.touch_updated_at();

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role
      and _user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  );

  insert into public.user_settings (user_id) values (new.id);
  insert into public.user_roles (user_id, role) values (new.id, 'client');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_active_account(_account public.account_type)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update public.profiles
  set active_account = _account
  where id = auth.uid();

  return jsonb_build_object('ok', true, 'account', _account);
end;
$$;

create or replace function public.reset_demo_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update public.trades
  set status = 'cancelled', closed_at = now()
  where user_id = auth.uid() and account_type = 'demo' and status = 'open';

  update public.profiles
  set demo_balance_usd = 10000.00, active_account = 'demo'
  where id = auth.uid();

  insert into public.transactions (
    user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta
  ) values (
    auth.uid(), 'demo_reset', 'system', 'demo', 10000.00, 'USD', 10000.00, 'completed', true,
    '{"reason": "user_reset"}'::jsonb
  );

  return jsonb_build_object('ok', true, 'demo_balance_usd', 10000.00);
end;
$$;

create or replace function public.place_trade(
  _module public.trade_module,
  _market text,
  _direction text,
  _stake numeric,
  _entry_price numeric default null,
  _meta jsonb default '{}'::jsonb
)
returns public.trades
language plpgsql
security definer
set search_path = public
as $$
declare
  _account public.account_type;
  _balance numeric;
  _trade public.trades;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select active_account,
    case when active_account = 'real' then balance_usd else demo_balance_usd end
  into _account, _balance
  from public.profiles
  where id = auth.uid()
  for update;

  if _balance is null then
    raise exception 'Profile not found';
  end if;
  if _stake <= 0 then
    raise exception 'Stake must be positive';
  end if;
  if _balance < _stake then
    raise exception 'Insufficient % balance', _account;
  end if;

  if _account = 'real' then
    update public.profiles set balance_usd = balance_usd - _stake where id = auth.uid();
  else
    update public.profiles set demo_balance_usd = demo_balance_usd - _stake where id = auth.uid();
  end if;

  insert into public.trades (user_id, account_type, module, market, direction, stake, entry_price, meta)
  values (auth.uid(), _account, _module, _market, _direction, _stake, _entry_price, coalesce(_meta, '{}'::jsonb))
  returning * into _trade;

  insert into public.transactions (user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta)
  values (auth.uid(), 'trade_stake', 'system', _account, _stake, 'USD', _stake, 'completed', _account = 'demo', jsonb_build_object('trade_id', _trade.id));

  return _trade;
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
    return jsonb_build_object('ok', true, 'payout', _trade.payout);
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

  update public.trades
  set status = case when _won then 'won'::public.trade_status else 'lost'::public.trade_status end,
      exit_price = _exit_price,
      payout = _payout,
      closed_at = now()
  where id = _trade_id;

  if _payout > 0 then
    if _trade.account_type = 'real' then
      update public.profiles set balance_usd = balance_usd + _payout where id = auth.uid();
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _payout where id = auth.uid();
    end if;

    insert into public.transactions (user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta)
    values (auth.uid(), 'trade_payout', 'system', _trade.account_type, _payout, 'USD', _payout, 'completed', _trade.account_type = 'demo', jsonb_build_object('trade_id', _trade.id));
  end if;

  return jsonb_build_object('ok', true, 'payout', _payout);
end;
$$;

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

  _amount_usd := case when upper(_currency) = 'KSH' then round((_amount / 130.0)::numeric, 2) else round(_amount::numeric, 2) end;
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
    user_id, kind, method, account_type, amount, currency, amount_usd, status, provider_reference, is_virtual, meta
  ) values (
    auth.uid(), _kind, _method, _account, _amount, upper(_currency), _amount_usd,
    case when _virtual or _method <> 'mpesa' then 'completed'::public.transaction_status else 'pending'::public.transaction_status end,
    _provider_reference, _virtual, coalesce(_meta, '{}'::jsonb) || jsonb_build_object('phone', _phone)
  ) returning * into _tx;

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

insert into public.polymarket_events (question, category, yes_price, no_price, volume_usd, ends_at) values
  ('Will Bitcoin reach $250,000 before January 1, 2030?', 'Crypto', 38, 62, 2840000, '2030-01-01T00:00:00Z'),
  ('Will Ethereum flip Bitcoin by market cap before 2029?', 'Crypto', 14, 86, 940000, '2029-01-01T00:00:00Z'),
  ('Will the US enter recession in 2027?', 'Macro', 47, 53, 1230000, '2028-01-01T00:00:00Z'),
  ('Will a SpaceX Starship land humans on Mars before 2031?', 'Science', 22, 78, 612000, '2031-12-31T00:00:00Z'),
  ('Will Fed cut rates by 25bps at next meeting?', 'Macro', 71, 29, 2400000, now() + interval '30 days'),
  ('Will BTC close above $120k this Friday?', 'Crypto', 62, 38, 184000, now() + interval '5 days'),
  ('Will EUR/USD trade above 1.16 today?', 'Forex', 55, 45, 340000, now() + interval '12 hours'),
  ('Will NVIDIA remain above $5T market cap through 2026?', 'Tech', 33, 67, 488000, '2026-12-31T00:00:00Z');

create or replace view public.agent_rollups
with (security_invoker = true) as
select
  a.id as agent_id,
  a.user_id as agent_user_id,
  a.referral_code,
  a.commission_pct,
  p.username as agent_username,
  count(distinct r.client_id) as client_count,
  coalesce(sum(case when t.kind = 'deposit' and t.is_virtual = false and t.status = 'completed' then t.amount_usd end), 0) as total_deposits,
  coalesce(sum(case when t.kind = 'withdraw' and t.is_virtual = false and t.status = 'completed' then t.amount_usd end), 0) as total_withdrawals,
  coalesce(sum(case when tr.status = 'lost' then tr.stake else 0 end)
         - sum(case when tr.status = 'won' then (tr.payout - tr.stake) else 0 end), 0) as house_retained
from public.agents a
left join public.profiles p on p.id = a.user_id
left join public.referrals r on r.agent_id = a.id
left join public.transactions t on t.user_id = r.client_id
left join public.trades tr on tr.user_id = r.client_id and tr.account_type = 'real'
group by a.id, a.user_id, a.referral_code, a.commission_pct, p.username;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_roles enable row level security;
alter table public.trades enable row level security;
alter table public.transactions enable row level security;
alter table public.payment_requests enable row level security;
alter table public.daraja_callbacks enable row level security;
alter table public.agents enable row level security;
alter table public.referrals enable row level security;
alter table public.polymarket_events enable row level security;
alter table public.kyc_documents enable row level security;

create policy "profiles read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles update own basic fields" on public.profiles for update to authenticated
using (id = auth.uid() or public.has_role(auth.uid(), 'admin'))
with check (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "settings own all" on public.user_settings for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "roles read own or admin" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "roles admin manage" on public.user_roles for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "trades read own or admin" on public.trades for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "transactions read own or admin" on public.transactions for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "payment requests read own or admin" on public.payment_requests for select to authenticated
using (
  public.has_role(auth.uid(), 'admin') or exists (
    select 1 from public.transactions t where t.id = payment_requests.transaction_id and t.user_id = auth.uid()
  )
);

create policy "callbacks admin read" on public.daraja_callbacks for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "agents read self or admin" on public.agents for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "agents admin manage" on public.agents for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "referrals visible to client agent admin" on public.referrals for select to authenticated
using (
  client_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or exists (select 1 from public.agents a where a.id = referrals.agent_id and a.user_id = auth.uid())
);
create policy "clients insert own referral" on public.referrals for insert to authenticated
with check (client_id = auth.uid());
create policy "referrals admin manage" on public.referrals for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "events signed in read" on public.polymarket_events for select to authenticated using (true);
create policy "events admin manage" on public.polymarket_events for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "kyc read own or admin" on public.kyc_documents for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "kyc insert own" on public.kyc_documents for insert to authenticated
with check (user_id = auth.uid());
create policy "kyc admin manage" on public.kyc_documents for all to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.user_settings, public.user_roles, public.trades, public.transactions, public.payment_requests, public.agents, public.referrals, public.polymarket_events, public.kyc_documents, public.agent_rollups to authenticated;
grant insert on public.referrals, public.kyc_documents to authenticated;
grant update (username, full_name, phone, active_account) on public.profiles to authenticated;
grant update on public.user_settings to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.set_active_account(public.account_type) to authenticated;
grant execute on function public.reset_demo_account() to authenticated;
grant execute on function public.place_trade(public.trade_module, text, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.settle_trade(uuid, boolean, numeric, numeric) to authenticated;
grant execute on function public.create_transaction(public.transaction_kind, public.payment_method, numeric, text, public.account_type, text, jsonb, text) to authenticated;
grant execute on function public.apply_transaction(uuid, public.transaction_status, jsonb) to service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
