-- CRITICAL FIX: Prevent double crediting of deposits
-- Issue: Deposits were being credited multiple times due to race condition
-- Root cause: The credited_at field wasn't being atomically set with the balance update

-- Drop the old buggy function
DROP FUNCTION IF EXISTS public.apply_transaction(uuid, public.transaction_status, jsonb);

-- Create the corrected version with proper atomic crediting
CREATE OR REPLACE FUNCTION public.apply_transaction(
  _transaction_id uuid,
  _status public.transaction_status,
  _meta jsonb default '{}'::jsonb
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx public.transactions;
  _should_credit boolean;
  _already_credited boolean;
BEGIN
  IF auth.uid() IS NULL AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock the transaction row for update
  SELECT * INTO _tx
  FROM public.transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF _tx.id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Check if already credited (this is the critical atomicity check)
  _already_credited := coalesce(_tx.meta->>'credited_at', '') <> '';

  -- Determine if we should credit this deposit
  -- Only credit if:
  -- 1. Status is being set to 'completed'
  -- 2. It's a deposit
  -- 3. It hasn't been credited before
  -- 4. It wasn't already completed (prevent re-crediting on status updates)
  _should_credit := _status = 'completed'
    AND _tx.kind = 'deposit'
    AND NOT _already_credited
    AND _tx.status <> 'completed';

  -- Credit the balance if conditions are met
  IF _should_credit THEN
    IF _tx.account_type = 'real' THEN
      UPDATE public.profiles
      SET 
        balance_usd = coalesce(balance_usd, 0) + coalesce(_tx.amount_usd, 0),
        balance_ksh = coalesce(balance_ksh, 0) + CASE WHEN _tx.currency = 'KSH' THEN coalesce(_tx.amount, 0) ELSE 0 END
      WHERE id = _tx.user_id;
    ELSE
      UPDATE public.profiles
      SET 
        demo_balance_usd = coalesce(demo_balance_usd, 0) + coalesce(_tx.amount_usd, 0),
        balance_ksh = coalesce(balance_ksh, 0) + CASE WHEN _tx.currency = 'KSH' THEN coalesce(_tx.amount, 0) ELSE 0 END
      WHERE id = _tx.user_id;
    END IF;
  END IF;

  -- Handle failed/cancelled withdrawals (refund to balance)
  IF _tx.kind = 'withdraw'
     AND _tx.status NOT IN ('failed', 'cancelled')
     AND _status IN ('failed', 'cancelled') THEN
    IF _tx.account_type = 'real' THEN
      UPDATE public.profiles
      SET balance_usd = coalesce(balance_usd, 0) + coalesce(_tx.amount_usd, 0)
      WHERE id = _tx.user_id;
    ELSE
      UPDATE public.profiles
      SET demo_balance_usd = coalesce(demo_balance_usd, 0) + coalesce(_tx.amount_usd, 0)
      WHERE id = _tx.user_id;
    END IF;
  END IF;

  -- Handle withdrawal completion (deduct from balance)
  IF _tx.kind = 'withdraw'
     AND _tx.status IN ('failed', 'cancelled')
     AND _status = 'completed' THEN
    IF _tx.account_type = 'real' THEN
      UPDATE public.profiles
      SET balance_usd = greatest(coalesce(balance_usd, 0) - coalesce(_tx.amount_usd, 0), 0)
      WHERE id = _tx.user_id;
    ELSE
      UPDATE public.profiles
      SET demo_balance_usd = greatest(coalesce(demo_balance_usd, 0) - coalesce(_tx.amount_usd, 0), 0)
      WHERE id = _tx.user_id;
    END IF;
  END IF;

  -- Update transaction status and metadata atomically
  -- CRITICAL: Set credited_at field ATOMICALLY with the status update to prevent race condition
  UPDATE public.transactions
  SET 
    status = _status,
    meta = coalesce(meta, '{}'::jsonb)
      || coalesce(_meta, '{}'::jsonb)
      || CASE
           WHEN _should_credit THEN jsonb_build_object(
             'credited_at', now()::text,
             'credited_by', 'apply_transaction'
           )
           ELSE '{}'::jsonb
         END,
    updated_at = now()
  WHERE id = _transaction_id
  RETURNING * INTO _tx;

  RETURN _tx;
END;
$$;

-- Fix any deposits that slipped through without being credited
-- Only credit deposits that:
-- - Are completed
-- - Have never been credited (no credited_at field)
-- - Don't have account_type = 'demo' or 'real' mismatch
WITH completed_uncredited_deposits AS (
  SELECT 
    id, 
    user_id, 
    account_type, 
    amount_usd, 
    currency, 
    amount
  FROM public.transactions
  WHERE kind = 'deposit'
    AND status = 'completed'
    AND coalesce(meta->>'credited_at', '') = ''
    AND account_type IS NOT NULL
    AND amount_usd IS NOT NULL
)
UPDATE public.profiles p
SET 
  balance_usd = coalesce(p.balance_usd, 0) + coalesce(d.amount_usd, 0),
  balance_ksh = coalesce(p.balance_ksh, 0) + CASE WHEN d.currency = 'KSH' THEN coalesce(d.amount, 0) ELSE 0 END,
  updated_at = now()
FROM completed_uncredited_deposits d
WHERE p.id = d.user_id
  AND d.account_type = 'real';

-- Same for demo accounts
WITH completed_uncredited_deposits AS (
  SELECT 
    id, 
    user_id, 
    account_type, 
    amount_usd, 
    currency, 
    amount
  FROM public.transactions
  WHERE kind = 'deposit'
    AND status = 'completed'
    AND coalesce(meta->>'credited_at', '') = ''
    AND account_type IS NOT NULL
    AND amount_usd IS NOT NULL
)
UPDATE public.profiles p
SET 
  demo_balance_usd = coalesce(p.demo_balance_usd, 0) + coalesce(d.amount_usd, 0),
  balance_ksh = coalesce(p.balance_ksh, 0) + CASE WHEN d.currency = 'KSH' THEN coalesce(d.amount, 0) ELSE 0 END,
  updated_at = now()
FROM completed_uncredited_deposits d
WHERE p.id = d.user_id
  AND d.account_type = 'demo';

-- Mark all backfilled deposits as credited
UPDATE public.transactions
SET 
  meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
    'credited_at', now()::text,
    'credited_by', 'backfill_migration'
  ),
  updated_at = now()
WHERE kind = 'deposit'
  AND status = 'completed'
  AND coalesce(meta->>'credited_at', '') = '';

-- Grant execution permission
GRANT EXECUTE ON FUNCTION public.apply_transaction(uuid, public.transaction_status, jsonb)
  TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
