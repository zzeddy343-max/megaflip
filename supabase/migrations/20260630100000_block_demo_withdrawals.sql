-- Demo balances are practice funds only. Never allow them to enter withdrawal flows.

create or replace function public.block_demo_withdrawals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'withdraw' and new.account_type = 'demo' then
    raise exception 'Demo funds cannot be withdrawn. Switch to your real account to withdraw.';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_block_demo_withdrawals on public.transactions;

create trigger transactions_block_demo_withdrawals
before insert or update of kind, account_type on public.transactions
for each row
execute function public.block_demo_withdrawals();

notify pgrst, 'reload schema';
