alter table public.profiles
  add column if not exists account_state text not null default 'active',
  add column if not exists freeze_until timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists moderation_note text;

update public.profiles
set account_state = coalesce(nullif(account_state, ''), 'active')
where account_state is null;

create index if not exists profiles_account_state_idx on public.profiles (account_state);
