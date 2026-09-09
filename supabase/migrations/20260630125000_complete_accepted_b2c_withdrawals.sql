-- B2C payouts reserve the user's balance before Safaricom pays.
-- If Safaricom accepts the B2C request but the result callback is delayed or
-- does not match, show the withdrawal as completed. A later failure/timeout
-- callback still refunds through apply_transaction.

create or replace function public.complete_accepted_b2c_withdrawals()
returns table(transaction_id uuid, user_id uuid, amount numeric, currency text, previous_status public.transaction_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  _row record;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  for _row in
    select t.id, t.user_id, t.amount, t.currency, t.status, pr.response_payload
    from public.transactions t
    join public.payment_requests pr on pr.transaction_id = t.id
    where t.kind = 'withdraw'
      and t.method = 'mpesa'
      and t.status in ('pending', 'processing')
      and pr.request_type = 'b2c'
      and (
        pr.conversation_id is not null
        or pr.originator_conversation_id is not null
        or pr.response_payload ? 'ConversationID'
        or pr.response_payload ? 'OriginatorConversationID'
      )
      and coalesce(pr.response_payload ->> 'ResponseCode', '0') = '0'
      and not exists (
        select 1
        from public.daraja_callbacks dc
        where dc.transaction_id = t.id
          and coalesce(dc.result_code, -1) <> 0
      )
    order by t.created_at
  loop
    transaction_id := _row.id;
    user_id := _row.user_id;
    amount := _row.amount;
    currency := _row.currency;
    previous_status := _row.status;

    perform public.apply_transaction(
      _row.id,
      'completed'::public.transaction_status,
      jsonb_build_object(
        'completed_on_b2c_acceptance', true,
        'daraja_result_code', 0,
        'daraja_result_description', coalesce(_row.response_payload ->> 'ResponseDescription', 'B2C request accepted by Safaricom'),
        'reconciled_at', now()
      )
    );

    update public.payment_requests
    set status = 'completed',
        response_payload = response_payload || jsonb_build_object(
          'completed_on_b2c_acceptance', true,
          'reconciled_at', now()
        )
    where transaction_id = _row.id
      and request_type = 'b2c';

    return next;
  end loop;
end;
$$;

grant execute on function public.complete_accepted_b2c_withdrawals() to service_role;
revoke execute on function public.complete_accepted_b2c_withdrawals() from public, anon, authenticated;

notify pgrst, 'reload schema';
