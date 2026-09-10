-- Allow administrators to control whether each agent's withdrawals reach M-Pesa.

alter table public.agents
  add column if not exists withdrawals_enabled boolean not null default true;

update public.agents
set withdrawals_enabled = true
where withdrawals_enabled is null;

notify pgrst, 'reload schema';
