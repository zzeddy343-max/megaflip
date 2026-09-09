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
    add column if not exists limits_min_stake_usd numeric;

  alter table public.system_settings
    alter column limits_min_stake_usd set default 1;

  alter table public.system_settings
    add column if not exists limits_max_stake_usd numeric;

  alter table public.system_settings
    alter column limits_max_stake_usd set default 1000;

  alter table public.system_settings
    add column if not exists volatility_model_variant text;

  alter table public.system_settings
    alter column volatility_model_variant set default 'standard';

  alter table public.system_settings
    add column if not exists user_segmentation_tags text;

  alter table public.system_settings
    alter column user_segmentation_tags set default 'VIP,HIGH ROLLER';

  alter table public.system_settings
    add column if not exists liability_limits_market_usd numeric;

  alter table public.system_settings
    alter column liability_limits_market_usd set default 5000;

  alter table public.system_settings
    add column if not exists liability_limits_user_usd numeric;

  alter table public.system_settings
    alter column liability_limits_user_usd set default 2000;

  alter table public.system_settings
    add column if not exists fraud_detection_enabled boolean;

  alter table public.system_settings
    alter column fraud_detection_enabled set default true;

  alter table public.system_settings
    add column if not exists fraud_detection_rules text;

  alter table public.system_settings
    alter column fraud_detection_rules set default 'bot,arbitrage';

  alter table public.system_settings
    add column if not exists engagement_notification_triggers text;

  alter table public.system_settings
    alter column engagement_notification_triggers set default 'trade,withdrawal';

  alter table public.system_settings
    add column if not exists caps_daily_loss_usd numeric;

  alter table public.system_settings
    alter column caps_daily_loss_usd set default 10000;

  alter table public.system_settings
    add column if not exists caps_weekly_loss_usd numeric;

  alter table public.system_settings
    alter column caps_weekly_loss_usd set default 50000;

  alter table public.system_settings
    add column if not exists caps_monthly_loss_usd numeric;

  alter table public.system_settings
    alter column caps_monthly_loss_usd set default 100000;

  perform pg_notify('pgrst', 'reload schema');

  execute $$
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
      min_deposit_usd = excluded.min_deposit_usd,
      min_withdrawal_usd = excluded.min_withdrawal_usd,
      withdrawal_tax_pct = excluded.withdrawal_tax_pct,
      rtp_percent = excluded.rtp_percent,
      limits_min_stake_usd = excluded.limits_min_stake_usd,
      limits_max_stake_usd = excluded.limits_max_stake_usd,
      volatility_model_variant = excluded.volatility_model_variant,
      user_segmentation_tags = excluded.user_segmentation_tags,
      liability_limits_market_usd = excluded.liability_limits_market_usd,
      liability_limits_user_usd = excluded.liability_limits_user_usd,
      fraud_detection_enabled = excluded.fraud_detection_enabled,
      fraud_detection_rules = excluded.fraud_detection_rules,
      engagement_notification_triggers = excluded.engagement_notification_triggers,
      caps_daily_loss_usd = excluded.caps_daily_loss_usd,
      caps_weekly_loss_usd = excluded.caps_weekly_loss_usd,
      caps_monthly_loss_usd = excluded.caps_monthly_loss_usd,
      updated_at = excluded.updated_at;
  $$;

  execute $$
    update public.system_settings
    set
      min_deposit_usd = coalesce(min_deposit_usd, 3),
      min_withdrawal_usd = coalesce(min_withdrawal_usd, 3),
      withdrawal_tax_pct = coalesce(withdrawal_tax_pct, 5),
      rtp_percent = coalesce(rtp_percent, 95),
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
  $$;
end $$;
