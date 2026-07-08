create table if not exists public.system_settings (
  id text primary key,
  min_deposit_usd numeric not null default 3,
  min_withdrawal_usd numeric not null default 3,
  withdrawal_tax_pct numeric not null default 5,
  rtp_percent numeric not null default 95,
  updated_at timestamptz default now()
);

insert into public.system_settings (
  id,
  min_deposit_usd,
  min_withdrawal_usd,
  withdrawal_tax_pct,
  rtp_percent,
  updated_at
)
values (
  'default',
  3,
  3,
  5,
  95,
  now()
)
on conflict (id) do update set
  min_deposit_usd = excluded.min_deposit_usd,
  min_withdrawal_usd = excluded.min_withdrawal_usd,
  withdrawal_tax_pct = excluded.withdrawal_tax_pct,
  rtp_percent = excluded.rtp_percent,
  updated_at = excluded.updated_at;
