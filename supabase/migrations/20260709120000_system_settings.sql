create table if not exists public.system_settings (
  id text primary key,
  min_deposit_usd numeric not null default 3,
  min_withdrawal_usd numeric not null default 3,
  withdrawal_tax_pct numeric not null default 5,
  rtp_percent numeric not null default 95,
  updated_at timestamptz default now()
);

do $$
begin
  alter table public.system_settings
    add column if not exists limits_min_stake_usd numeric default 1;

  alter table public.system_settings
    add column if not exists limits_max_stake_usd numeric default 1000;

  alter table public.system_settings
    add column if not exists volatility_model_variant text default 'standard';

  alter table public.system_settings
    add column if not exists user_segmentation_tags text default 'VIP,HIGH ROLLER';

  alter table public.system_settings
    add column if not exists liability_limits_market_usd numeric default 5000;

  alter table public.system_settings
    add column if not exists liability_limits_user_usd numeric default 2000;

  alter table public.system_settings
    add column if not exists fraud_detection_enabled boolean default true;

  alter table public.system_settings
    add column if not exists fraud_detection_rules text default 'bot,arbitrage';

  alter table public.system_settings
    add column if not exists engagement_notification_triggers text default 'trade,withdrawal';

  alter table public.system_settings
    add column if not exists caps_daily_loss_usd numeric default 10000;

  alter table public.system_settings
    add column if not exists caps_weekly_loss_usd numeric default 50000;

  alter table public.system_settings
    add column if not exists caps_monthly_loss_usd numeric default 100000;

  perform pg_notify('pgrst', 'reload schema');
end $$;

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

update public.system_settings
set
  limits_min_stake_usd = coalesce(limits_min_stake_usd, 1),
  limits_max_stake_usd = coalesce(limits_max_stake_usd, 1000),
  volatility_model_variant = coalesce(volatility_model_variant, 'standard'),
  user_segmentation_tags = coalesce(user_segmentation_tags, 'VIP,HIGH ROLLER'),
  liability_limits_market_usd = coalesce(liability_limits_market_usd, 5000),
  liability_limits_user_usd = coalesce(liability_limits_user_usd, 2000),
  fraud_detection_enabled = coalesce(fraud_detection_enabled, true),
  fraud_detection_rules = coalesce(fraud_detection_rules, 'bot,arbitrage'),
  engagement_notification_triggers = coalesce(engagement_notification_triggers, 'trade,withdrawal'),
  caps_daily_loss_usd = coalesce(caps_daily_loss_usd, 10000),
  caps_weekly_loss_usd = coalesce(caps_weekly_loss_usd, 50000),
  caps_monthly_loss_usd = coalesce(caps_monthly_loss_usd, 100000)
where id = 'default';
