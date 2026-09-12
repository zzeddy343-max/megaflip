-- Keep provider callback reconciliation indexed as payment volume grows.
create index if not exists payment_requests_conversation_idx
  on public.payment_requests(conversation_id);
create index if not exists payment_requests_originator_conversation_idx
  on public.payment_requests(originator_conversation_id);
create index if not exists daraja_callbacks_transaction_result_idx
  on public.daraja_callbacks(transaction_id, result_code, created_at desc);
create index if not exists transactions_user_kind_status_created_idx
  on public.transactions(user_id, kind, status, created_at desc);

notify pgrst, 'reload schema';
