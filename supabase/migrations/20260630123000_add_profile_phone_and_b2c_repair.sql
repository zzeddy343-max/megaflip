-- Store a fixed M-Pesa phone on profiles and repair successful M-Pesa callbacks
-- that were accepted by Safaricom but did not update the matching transaction.

alter table public.profiles
  add column if not exists phone text;

grant update (username, full_name, phone, active_account) on public.profiles to authenticated;

create or replace function public.reconcile_successful_b2c_callbacks()
returns table(callback_id uuid, transaction_id uuid, status public.transaction_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  _cb record;
  _tx_id uuid;
  _conversation_id text;
  _originator_conversation_id text;
  _checkout_request_id text;
  _occasion text;
  _tx_ref text;
  _request_type text;
begin
  for _cb in
    select dc.id, dc.payload, dc.transaction_id, dc.callback_type, dc.checkout_request_id
    from public.daraja_callbacks dc
    left join public.transactions tx on tx.id = dc.transaction_id
    where dc.callback_type in ('stk', 'b2c', 'b2c_timeout')
      and coalesce(dc.result_code, -1) = 0
      and (dc.transaction_id is null or tx.status in ('pending', 'processing'))
  loop
    _tx_id := _cb.transaction_id;
    _request_type := case when _cb.callback_type = 'stk' then 'stk_push' else 'b2c' end;
    _checkout_request_id := coalesce(_cb.checkout_request_id, _cb.payload #>> '{Body,stkCallback,CheckoutRequestID}');
    _conversation_id := _cb.payload #>> '{Result,ConversationID}';
    _originator_conversation_id := _cb.payload #>> '{Result,OriginatorConversationID}';
    _occasion := _cb.payload #>> '{Result,ReferenceData,ReferenceItem,Value}';
    _tx_ref := null;

    if _occasion like 'MEGAFLIP-%' then
      _tx_ref := lower(replace(_occasion, 'MEGAFLIP-', ''));
    end if;

    if _tx_id is null then
      if _request_type = 'stk_push' then
        select pr.transaction_id
        into _tx_id
        from public.payment_requests pr
        where pr.request_type = 'stk_push'
          and _checkout_request_id is not null
          and pr.checkout_request_id = _checkout_request_id
        order by pr.created_at desc
        limit 1;
      else
        select pr.transaction_id
        into _tx_id
        from public.payment_requests pr
        join public.transactions t on t.id = pr.transaction_id
        where pr.request_type = 'b2c'
          and (
            (_conversation_id is not null and pr.conversation_id = _conversation_id)
            or (_originator_conversation_id is not null and pr.originator_conversation_id = _originator_conversation_id)
            or (_tx_ref is not null and lower(t.id::text) like _tx_ref || '%')
          )
        order by pr.created_at desc
        limit 1;
      end if;
    end if;

    if _tx_id is not null then
      perform public.apply_transaction(
        _tx_id,
        'completed'::public.transaction_status,
        jsonb_build_object(
          'daraja_result_code', 0,
          'daraja_result_description', 'Reconciled successful B2C callback',
          'callback_at', now()
        )
      );

      update public.daraja_callbacks
      set transaction_id = _tx_id,
          payment_request_id = coalesce(
            payment_request_id,
            (
              select pr.id
              from public.payment_requests pr
              where pr.transaction_id = _tx_id
                and pr.request_type = _request_type
              order by pr.created_at desc
              limit 1
            )
          )
      where id = _cb.id;

      update public.payment_requests pr
      set status = 'completed',
          response_payload = _cb.payload
      where pr.transaction_id = _tx_id
        and pr.request_type = _request_type;

      callback_id := _cb.id;
      transaction_id := _tx_id;
      status := 'completed'::public.transaction_status;
      return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.reconcile_successful_b2c_callbacks() to service_role;
revoke execute on function public.reconcile_successful_b2c_callbacks() from public, anon, authenticated;

notify pgrst, 'reload schema';
