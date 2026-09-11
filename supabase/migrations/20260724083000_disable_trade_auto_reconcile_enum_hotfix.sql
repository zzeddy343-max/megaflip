-- Hotfix: trade close/cancel was failing with
-- invalid input value for enum trade_status: "completed".
--
-- The deployed auto-reconciliation trigger path is unsafe for trades on older
-- databases because it can route transaction-style statuses into trade_status
-- work. Keep manual/admin reconciliation available, but stop the automatic
-- trade trigger from running during normal close/cancel/settlement.

update public.ledger_reconciliation_config
set enabled = false,
    auto_fix_enabled = false,
    updated_at = now();

create or replace function public.auto_reconcile_user_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _result jsonb;
begin
  if not exists (
    select 1
    from public.ledger_reconciliation_config
    where enabled and auto_fix_enabled
  ) then
    return new;
  end if;

  if TG_TABLE_NAME = 'transactions'
     and new.status in ('completed', 'failed', 'cancelled') then
    _result := public.reconcile_user_balance(
      new.user_id,
      new.account_type,
      'Auto-reconciliation on transaction: ' || TG_OP
    );
  end if;

  return new;
end;
$$;

drop trigger if exists auto_reconcile_trades on public.trades;

notify pgrst, 'reload schema';
