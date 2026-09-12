-- Win-rate target is a reporting/configuration value only.
-- Settlement code must not use it to choose individual trade outcomes.
alter table if exists public.system_settings
  add column if not exists win_rate_percent numeric not null default 50;

update public.system_settings
set win_rate_percent = coalesce(win_rate_percent, 50)
where id = 'default';
