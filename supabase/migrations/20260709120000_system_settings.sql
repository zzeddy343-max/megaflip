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
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'limits_min_stake_usd'
  ) then
    alter table public.system_settings add column limits_min_stake_usd numeric default 1;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'limits_max_stake_usd'
  ) then
    alter table public.system_settings add column limits_max_stake_usd numeric default 1000;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'volatility_model_variant'
  ) then
    alter table public.system_settings add column volatility_model_variant text default 'standard';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'user_segmentation_tags'
  ) then
    alter table public.system_settings add column user_segmentation_tags text default 'VIP,HIGH ROLLER';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'liability_limits_market_usd'
  ) then
    alter table public.system_settings add column liability_limits_market_usd numeric default 5000;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'liability_limits_user_usd'
  ) then
    alter table public.system_settings add column liability_limits_user_usd numeric default 2000;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'fraud_detection_enabled'
  ) then
    alter table public.system_settings add column fraud_detection_enabled boolean default true;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'fraud_detection_rules'
  ) then
    alter table public.system_settings add column fraud_detection_rules text default 'bot,arbitrage';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'engagement_notification_triggers'
  ) then
    alter table public.system_settings add column engagement_notification_triggers text default 'trade,withdrawal';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'caps_daily_loss_usd'
  ) then
    alter table public.system_settings add column caps_daily_loss_usd numeric default 10000;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'caps_weekly_loss_usd'
  ) then
    alter table public.system_settings add column caps_weekly_loss_usd numeric default 50000;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'caps_monthly_loss_usd'
  ) then
    alter table public.system_settings add column caps_monthly_loss_usd numeric default 100000;
  end if;
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
