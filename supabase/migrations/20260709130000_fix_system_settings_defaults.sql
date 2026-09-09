create table if not exists public.system_settings (
  id text primary key,
  min_deposit_usd numeric not null default 3,
  min_withdrawal_usd numeric not null default 3,
  withdrawal_tax_pct numeric not null default 5,
  rtp_percent numeric not null default 95,
  limits_min_stake_usd numeric default 1,
  limits_max_stake_usd numeric default 1000,
  volatility_model_variant text default 'standard',
  user_segmentation_tags text default 'VIP,HIGH ROLLER',
  liability_limits_market_usd numeric default 5000,
  liability_limits_user_usd numeric default 2000,
  fraud_detection_enabled boolean default true,
  fraud_detection_rules text default 'bot,arbitrage',
  engagement_notification_triggers text default 'trade,withdrawal',
  caps_daily_loss_usd numeric default 10000,
  caps_weekly_loss_usd numeric default 50000,
  caps_monthly_loss_usd numeric default 100000,
  updated_at timestamptz default now()
);

do $$
begin
  alter table public.system_settings
    add column if not exists min_deposit_usd numeric;

  alter table public.system_settings
    add column if not exists min_withdrawal_usd numeric;

  alter table public.system_settings
    add column if not exists withdrawal_tax_pct numeric;

  alter table public.system_settings
    add column if not exists rtp_percent numeric;

  alter table public.system_settings
    add column if not exists limits_min_stake_usd numeric;

  alter table public.system_settings
    add column if not exists limits_max_stake_usd numeric;

  alter table public.system_settings
    add column if not exists volatility_model_variant text;

  alter table public.system_settings
    add column if not exists user_segmentation_tags text;

  alter table public.system_settings
    add column if not exists liability_limits_market_usd numeric;

  alter table public.system_settings
    add column if not exists liability_limits_user_usd numeric;

  alter table public.system_settings
    add column if not exists fraud_detection_enabled boolean;

  alter table public.system_settings
    add column if not exists fraud_detection_rules text;

  alter table public.system_settings
    add column if not exists engagement_notification_triggers text;

  alter table public.system_settings
    add column if not exists caps_daily_loss_usd numeric;

  alter table public.system_settings
    add column if not exists caps_weekly_loss_usd numeric;

  alter table public.system_settings
    add column if not exists caps_monthly_loss_usd numeric;

  alter table public.system_settings
    add column if not exists updated_at timestamptz;

  perform pg_notify('pgrst', 'reload schema');
end $$;

insert into public.system_settings (
  id,
  min_deposit_usd,
  min_withdrawal_usd,
  withdrawal_tax_pct,
  rtp_percent,
  limits_min_stake_usd,
  limits_max_stake_usd,
  volatility_model_variant,
  user_segmentation_tags,
  liability_limits_market_usd,
  liability_limits_user_usd,
  fraud_detection_enabled,
  fraud_detection_rules,
  engagement_notification_triggers,
  caps_daily_loss_usd,
  caps_weekly_loss_usd,
  caps_monthly_loss_usd,
  updated_at
)
values (
  'default',
  3,
  3,
  5,
  95,
  1,
  1000,
  'standard',
  'VIP,HIGH ROLLER',
  5000,
  2000,
  true,
  'bot,arbitrage',
  'trade,withdrawal',
  10000,
  50000,
  100000,
  now()
)
on conflict (id) do update set
  min_deposit_usd = coalesce(excluded.min_deposit_usd, public.system_settings.min_deposit_usd, 3),
  min_withdrawal_usd = coalesce(excluded.min_withdrawal_usd, public.system_settings.min_withdrawal_usd, 3),
  withdrawal_tax_pct = coalesce(excluded.withdrawal_tax_pct, public.system_settings.withdrawal_tax_pct, 5),
  rtp_percent = coalesce(excluded.rtp_percent, public.system_settings.rtp_percent, 95),
  limits_min_stake_usd = coalesce(excluded.limits_min_stake_usd, public.system_settings.limits_min_stake_usd, 1),
  limits_max_stake_usd = coalesce(excluded.limits_max_stake_usd, public.system_settings.limits_max_stake_usd, 1000),
  volatility_model_variant = coalesce(excluded.volatility_model_variant, public.system_settings.volatility_model_variant, 'standard'),
  user_segmentation_tags = coalesce(excluded.user_segmentation_tags, public.system_settings.user_segmentation_tags, 'VIP,HIGH ROLLER'),
  liability_limits_market_usd = coalesce(excluded.liability_limits_market_usd, public.system_settings.liability_limits_market_usd, 5000),
  liability_limits_user_usd = coalesce(excluded.liability_limits_user_usd, public.system_settings.liability_limits_user_usd, 2000),
  fraud_detection_enabled = coalesce(excluded.fraud_detection_enabled, public.system_settings.fraud_detection_enabled, true),
  fraud_detection_rules = coalesce(excluded.fraud_detection_rules, public.system_settings.fraud_detection_rules, 'bot,arbitrage'),
  engagement_notification_triggers = coalesce(excluded.engagement_notification_triggers, public.system_settings.engagement_notification_triggers, 'trade,withdrawal'),
  caps_daily_loss_usd = coalesce(excluded.caps_daily_loss_usd, public.system_settings.caps_daily_loss_usd, 10000),
  caps_weekly_loss_usd = coalesce(excluded.caps_weekly_loss_usd, public.system_settings.caps_weekly_loss_usd, 50000),
  caps_monthly_loss_usd = coalesce(excluded.caps_monthly_loss_usd, public.system_settings.caps_monthly_loss_usd, 100000),
  updated_at = excluded.updated_at;
