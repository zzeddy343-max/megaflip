-- Win-rate target used by ordinary users' real-money binary settlement.
alter table if exists public.system_settings
  add column if not exists win_rate_percent numeric not null default 50;

update public.system_settings
set win_rate_percent = coalesce(win_rate_percent, 50)
where id = 'default';
