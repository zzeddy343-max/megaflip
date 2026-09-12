-- A provider acceptance response is not proof that the customer received funds.
-- Keep withdrawals processing until the provider result callback confirms success.
create or replace function public.complete_accepted_b2c_withdrawals()
returns table(transaction_id uuid, user_id uuid, amount numeric, currency text, previous_status public.transaction_status)
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  return;
end;
$$;

grant execute on function public.complete_accepted_b2c_withdrawals() to service_role;
revoke execute on function public.complete_accepted_b2c_withdrawals() from public, anon, authenticated;

notify pgrst, 'reload schema';
