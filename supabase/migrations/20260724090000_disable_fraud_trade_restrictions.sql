-- Disable the rapid-trade fraud restriction. Bot Builder and scanner auto-trade
-- intentionally place repeated short binary contracts, so the old "bot" rule
-- blocked legitimate automated trades with "rapid trade burst".

alter table if exists public.system_settings
  alter column fraud_detection_enabled set default false,
  alter column fraud_detection_rules set default '';

update public.system_settings
set
  fraud_detection_enabled = false,
  fraud_detection_rules = '',
  updated_at = now()
where id = 'default';
