-- Support chat for users/admins plus manual real-money summary adjustments.

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null default 'Support',
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_at timestamptz not null default now(),
  unread_by_admin integer not null default 0,
  unread_by_user integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin')),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.account_metric_adjustments (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  deposits_usd numeric(18,2) not null default 0,
  withdrawals_usd numeric(18,2) not null default 0,
  retained_usd numeric(18,2) not null default 0,
  stakes_usd numeric(18,2) not null default 0,
  trades integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.account_summary_resets (
  id uuid primary key default gen_random_uuid(),
  reset_by uuid references public.profiles(id) on delete set null,
  reason text not null default 'Manual summary reset',
  created_at timestamptz not null default now()
);

create index if not exists support_threads_user_idx on public.support_threads(user_id, last_message_at desc);
create index if not exists support_messages_thread_idx on public.support_messages(thread_id, created_at asc);
create index if not exists account_metric_adjustments_created_idx on public.account_metric_adjustments(created_at desc);
create index if not exists account_summary_resets_created_idx on public.account_summary_resets(created_at desc);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.account_metric_adjustments enable row level security;
alter table public.account_summary_resets enable row level security;

drop policy if exists "support threads visible to owner or admin" on public.support_threads;
create policy "support threads visible to owner or admin" on public.support_threads
for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "support messages visible to owner or admin" on public.support_messages;
create policy "support messages visible to owner or admin" on public.support_messages
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.support_threads t
    where t.id = support_messages.thread_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists "account adjustments admin read" on public.account_metric_adjustments;
create policy "account adjustments admin read" on public.account_metric_adjustments
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "account adjustments admin write" on public.account_metric_adjustments;
create policy "account adjustments admin write" on public.account_metric_adjustments
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "account summary resets admin read" on public.account_summary_resets;
create policy "account summary resets admin read" on public.account_summary_resets
for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "account summary resets admin write" on public.account_summary_resets;
create policy "account summary resets admin write" on public.account_summary_resets
for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

grant select on public.support_threads, public.support_messages to authenticated;
grant select, insert, update, delete on public.account_metric_adjustments to authenticated;
grant select, insert on public.account_summary_resets to authenticated;
grant all on public.support_threads, public.support_messages, public.account_metric_adjustments, public.account_summary_resets to service_role;
