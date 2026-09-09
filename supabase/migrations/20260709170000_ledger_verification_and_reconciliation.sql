-- COMPREHENSIVE LEDGER VERIFICATION AND RECONCILIATION SYSTEM
-- Ensures all balances match the actual sum of transactions and trades
-- Provides audit trail and automatic reconciliation

-- ============================================================================
-- 1. LEDGER CALCULATION VIEW - Compute true balances from transactions + trades
-- ============================================================================

DROP VIEW IF EXISTS public.user_ledger_summary CASCADE;

CREATE OR REPLACE VIEW public.user_ledger_summary AS
WITH transaction_summary AS (
  -- Sum all transaction effects on balances
  SELECT
    user_id,
    account_type,
    SUM(CASE
      -- Deposits completed: add to balance
      WHEN kind = 'deposit' AND status = 'completed' THEN amount_usd
      -- Deposits not completed: don't affect balance
      WHEN kind = 'deposit' AND status <> 'completed' THEN 0
      -- Withdrawals pending: deduct (held)
      WHEN kind = 'withdraw' AND status = 'pending' THEN -amount_usd
      -- Withdrawals processing: deduct (held)
      WHEN kind = 'withdraw' AND status = 'processing' THEN -amount_usd
      -- Withdrawals completed: already deducted, no change
      WHEN kind = 'withdraw' AND status = 'completed' THEN 0
      -- Withdrawals failed/cancelled: refund
      WHEN kind = 'withdraw' AND status IN ('failed', 'cancelled') THEN amount_usd
      -- Trade stakes: deduct (handled separately in trade logic)
      WHEN kind = 'trade_stake' THEN -amount_usd
      -- Trade payouts: add
      WHEN kind = 'trade_payout' THEN amount_usd
      -- Admin credits: add
      WHEN kind = 'admin_credit' THEN amount_usd
      -- Admin debits: deduct
      WHEN kind = 'admin_debit' THEN -amount_usd
      -- Demo reset: set to fixed amount (handled specially)
      WHEN kind = 'demo_reset' THEN 0
      ELSE 0
    END) AS balance_from_transactions,
    SUM(CASE
      WHEN kind = 'demo_reset' AND status = 'completed' THEN amount_usd
      ELSE 0
    END) AS demo_reset_amount,
    COUNT(*) FILTER (WHERE kind = 'deposit' AND status = 'completed') AS completed_deposits,
    COUNT(*) FILTER (WHERE kind = 'withdraw' AND status = 'completed') AS completed_withdrawals,
    COUNT(*) FILTER (WHERE kind = 'trade_stake' AND status = 'completed') AS completed_stakes,
    COUNT(*) FILTER (WHERE kind = 'trade_payout' AND status = 'completed') AS completed_payouts,
    SUM(amount_usd) FILTER (WHERE kind = 'deposit' AND status = 'completed') AS total_deposits_usd,
    SUM(amount_usd) FILTER (WHERE kind = 'withdraw' AND status = 'completed') AS total_withdrawals_usd,
    SUM(amount_usd) FILTER (WHERE kind = 'trade_stake' AND status = 'completed') AS total_stakes_usd,
    SUM(amount_usd) FILTER (WHERE kind = 'trade_payout' AND status = 'completed') AS total_payouts_usd
  FROM public.transactions
  GROUP BY user_id, account_type
),
trade_summary AS (
  -- Verify trades are correctly recorded
  SELECT
    user_id,
    account_type,
    COUNT(*) FILTER (WHERE status = 'open') AS open_trades,
    COUNT(*) FILTER (WHERE status IN ('won', 'lost', 'closed', 'cancelled')) AS closed_trades,
    COUNT(*) FILTER (WHERE status = 'won') AS won_trades,
    COUNT(*) FILTER (WHERE status = 'lost') AS lost_trades,
    SUM(stake) FILTER (WHERE status IN ('won', 'lost', 'closed', 'cancelled')) AS total_staked,
    SUM(payout) FILTER (WHERE status IN ('won', 'lost', 'closed', 'cancelled')) AS total_payouts
  FROM public.trades
  GROUP BY user_id, account_type
)
SELECT
  p.id AS user_id,
  p.username,
  p.full_name,
  p.active_account,
  'real'::public.account_type AS account_type,
  p.balance_usd AS current_balance,
  COALESCE(ts.balance_from_transactions, 0) +
    COALESCE(
      (SELECT COALESCE(SUM(payout - stake), 0)
       FROM public.trades
       WHERE user_id = p.id AND account_type = 'real'::public.account_type AND status IN ('won', 'lost')),
      0
    ) AS calculated_balance,
  (p.balance_usd -
    (COALESCE(ts.balance_from_transactions, 0) +
      COALESCE(
        (SELECT COALESCE(SUM(payout - stake), 0)
         FROM public.trades
       WHERE user_id = p.id AND account_type = 'real'::public.account_type AND status IN ('won', 'lost')),
        0
      ))) AS balance_discrepancy,
  COALESCE(ts.completed_deposits, 0) AS deposits_count,
  COALESCE(ts.total_deposits_usd, 0) AS total_deposits,
  COALESCE(ts.completed_withdrawals, 0) AS withdrawals_count,
  COALESCE(ts.total_withdrawals_usd, 0) AS total_withdrawals,
  COALESCE(tr.open_trades, 0) AS open_trades,
  COALESCE(tr.closed_trades, 0) AS closed_trades,
  COALESCE(tr.won_trades, 0) AS won_trades,
  COALESCE(tr.lost_trades, 0) AS lost_trades,
  COALESCE(ts.total_stakes_usd, 0) AS total_stakes,
  COALESCE(ts.total_payouts_usd, 0) AS total_payouts,
  p.created_at,
  p.updated_at
FROM public.profiles p
LEFT JOIN transaction_summary ts ON p.id = ts.user_id AND ts.account_type = 'real'::public.account_type
LEFT JOIN trade_summary tr ON p.id = tr.user_id AND tr.account_type = 'real'::public.account_type

UNION ALL

SELECT
  p.id AS user_id,
  p.username,
  p.full_name,
  p.active_account,
  'demo'::public.account_type AS account_type,
  p.demo_balance_usd AS current_balance,
  COALESCE(ts.balance_from_transactions, 0) +
    COALESCE(
      (SELECT COALESCE(SUM(payout - stake), 0)
       FROM public.trades
       WHERE user_id = p.id AND account_type = 'demo'::public.account_type AND status IN ('won', 'lost')),
      0
    ) AS calculated_balance,
  (p.demo_balance_usd -
    (COALESCE(ts.balance_from_transactions, 0) +
      COALESCE(
        (SELECT COALESCE(SUM(payout - stake), 0)
         FROM public.trades
       WHERE user_id = p.id AND account_type = 'demo'::public.account_type AND status IN ('won', 'lost')),
        0
      ))) AS balance_discrepancy,
  COALESCE(ts.completed_deposits, 0) AS deposits_count,
  COALESCE(ts.total_deposits_usd, 0) AS total_deposits,
  COALESCE(ts.completed_withdrawals, 0) AS withdrawals_count,
  COALESCE(ts.total_withdrawals_usd, 0) AS total_withdrawals,
  COALESCE(tr.open_trades, 0) AS open_trades,
  COALESCE(tr.closed_trades, 0) AS closed_trades,
  COALESCE(tr.won_trades, 0) AS won_trades,
  COALESCE(tr.lost_trades, 0) AS lost_trades,
  COALESCE(ts.total_stakes_usd, 0) AS total_stakes,
  COALESCE(ts.total_payouts_usd, 0) AS total_payouts,
  p.created_at,
  p.updated_at
FROM public.profiles p
LEFT JOIN transaction_summary ts ON p.id = ts.user_id AND ts.account_type = 'demo'::public.account_type
LEFT JOIN trade_summary tr ON p.id = tr.user_id AND tr.account_type = 'demo'::public.account_type
WHERE p.demo_balance_usd > 0 OR EXISTS (SELECT 1 FROM public.trades WHERE user_id = p.id AND account_type = 'demo'::public.account_type);

-- ============================================================================
-- 2. AUDIT LOG TABLE - Track all balance changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.balance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type public.account_type NOT NULL,
  audit_type text NOT NULL CHECK (audit_type IN ('transaction', 'trade', 'adjustment', 'correction', 'verification')),
  previous_balance numeric(18,2),
  new_balance numeric(18,2),
  calculated_balance numeric(18,2),
  discrepancy numeric(18,2),
  source text,
  reason text,
  details jsonb DEFAULT '{}'::jsonb,
  corrected boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS audit_log_user_idx ON public.balance_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_discrepancy_idx ON public.balance_audit_log(user_id, account_type) WHERE discrepancy <> 0;

-- ============================================================================
-- 3. AUDIT FUNCTION - Check for balance discrepancies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_user_balance(
  _user_id uuid DEFAULT NULL,
  _account_type public.account_type DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  account_type public.account_type,
  username text,
  current_balance numeric,
  calculated_balance numeric,
  discrepancy numeric,
  discrepancy_pct numeric,
  status text,
  details jsonb
) AS $$
DECLARE
  _current_balance numeric;
  _calculated_balance numeric;
  _discrepancy numeric;
  _discrepancy_pct numeric;
  _status text;
  _row RECORD;
BEGIN
  -- If no user specified, audit all users with discrepancies
  IF _user_id IS NULL THEN
    RETURN QUERY
    SELECT
      u.user_id,
      u.account_type,
      u.username,
      u.current_balance,
      u.calculated_balance,
      u.balance_discrepancy,
      CASE
        WHEN u.current_balance = 0 THEN 0
        ELSE ROUND((u.balance_discrepancy / u.current_balance * 100)::numeric, 2)
      END AS discrepancy_pct,
      CASE
        WHEN u.balance_discrepancy = 0 THEN 'OK'
        WHEN u.balance_discrepancy > 0 THEN 'OVER_CREDITED'
        ELSE 'UNDER_CREDITED'
      END AS status,
      jsonb_build_object(
        'deposits_count', u.deposits_count,
        'withdrawals_count', u.withdrawals_count,
        'open_trades', u.open_trades,
        'won_trades', u.won_trades,
        'lost_trades', u.lost_trades,
        'total_deposits', u.total_deposits,
        'total_withdrawals', u.total_withdrawals,
        'total_stakes', u.total_stakes,
        'total_payouts', u.total_payouts
      )
    FROM public.user_ledger_summary u
    WHERE (_account_type::public.account_type IS NULL OR u.account_type = _account_type::public.account_type)
      AND u.balance_discrepancy <> 0;
  ELSE
    -- Audit specific user
    RETURN QUERY
    SELECT
      u.user_id,
      u.account_type,
      u.username,
      u.current_balance,
      u.calculated_balance,
      u.balance_discrepancy,
      CASE
        WHEN u.current_balance = 0 THEN 0
        ELSE ROUND((u.balance_discrepancy / u.current_balance * 100)::numeric, 2)
      END AS discrepancy_pct,
      CASE
        WHEN u.balance_discrepancy = 0 THEN 'OK'
        WHEN u.balance_discrepancy > 0 THEN 'OVER_CREDITED'
        ELSE 'UNDER_CREDITED'
      END AS status,
      jsonb_build_object(
        'deposits_count', u.deposits_count,
        'withdrawals_count', u.withdrawals_count,
        'open_trades', u.open_trades,
        'won_trades', u.won_trades,
        'lost_trades', u.lost_trades,
        'total_deposits', u.total_deposits,
        'total_withdrawals', u.total_withdrawals,
        'total_stakes', u.total_stakes,
        'total_payouts', u.total_payouts
      )
    FROM public.user_ledger_summary u
    WHERE u.user_id = _user_id
      AND (_account_type::public.account_type IS NULL OR u.account_type = _account_type::public.account_type);
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.audit_user_balance(
  _user_id uuid DEFAULT NULL,
  _account_type text DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  account_type public.account_type,
  username text,
  current_balance numeric,
  calculated_balance numeric,
  discrepancy numeric,
  discrepancy_pct numeric,
  status text,
  details jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.audit_user_balance(_user_id, _account_type::public.account_type);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. RECONCILIATION FUNCTION - Fix discrepancies and log corrections
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_user_balance(
  _user_id uuid,
  _account_type public.account_type,
  _reason text DEFAULT 'Admin reconciliation'
)
RETURNS jsonb AS $$
DECLARE
  _current_balance numeric;
  _calculated_balance numeric;
  _discrepancy numeric;
  _column_name text;
  _audit_id uuid;
  _admin_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get admin or user making the correction
  _admin_id := auth.uid();

  -- Get balances from ledger
  SELECT
    current_balance,
    calculated_balance,
    ABS(balance_discrepancy) AS discrepancy
  INTO _current_balance, _calculated_balance, _discrepancy
  FROM public.user_ledger_summary
  WHERE user_id = _user_id AND account_type = _account_type::public.account_type;

  IF _current_balance IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'User or account type not found'
    );
  END IF;

  -- If no discrepancy, return OK
  IF _discrepancy = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'balanced',
      'message', 'Balance is already accurate',
      'current_balance', _current_balance,
      'calculated_balance', _calculated_balance
    );
  END IF;

  -- Determine column to update
  _column_name := CASE
    WHEN _account_type::public.account_type = 'real'::public.account_type THEN 'balance_usd'
    WHEN _account_type::public.account_type = 'demo'::public.account_type THEN 'demo_balance_usd'
    ELSE NULL
  END;

  -- Update profile with calculated balance
  UPDATE public.profiles
  SET
    balance_usd = CASE WHEN _column_name = 'balance_usd' THEN _calculated_balance ELSE balance_usd END,
    demo_balance_usd = CASE WHEN _column_name = 'demo_balance_usd' THEN _calculated_balance ELSE demo_balance_usd END,
    updated_at = now()
  WHERE id = _user_id;

  -- Log the correction
  INSERT INTO public.balance_audit_log (
    user_id,
    account_type,
    audit_type,
    previous_balance,
    new_balance,
    calculated_balance,
    discrepancy,
    source,
    reason,
    details,
    corrected,
    created_by
  ) VALUES (
    _user_id,
    _account_type,
    'correction',
    _current_balance,
    _calculated_balance,
    _calculated_balance,
    _discrepancy,
    'reconcile_user_balance',
    _reason,
    jsonb_build_object(
      'correction_applied', true,
      'direction', CASE
        WHEN _calculated_balance > _current_balance THEN 'credited'
        ELSE 'debited'
      END,
      'amount', _discrepancy
    ),
    true,
    _admin_id
  ) RETURNING id INTO _audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'corrected',
    'message', 'Balance reconciled successfully',
    'previous_balance', _current_balance,
    'new_balance', _calculated_balance,
    'correction_amount', _discrepancy,
    'direction', CASE
      WHEN _calculated_balance > _current_balance THEN 'CREDITED'
      ELSE 'DEBITED'
    END,
    'audit_id', _audit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reconcile_user_balance(
  _user_id uuid,
  _account_type text,
  _reason text DEFAULT 'Admin reconciliation'
)
RETURNS jsonb AS $$
BEGIN
  RETURN public.reconcile_user_balance(_user_id, _account_type::public.account_type, _reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. BULK RECONCILIATION - Fix all discrepancies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_all_balances(
  _max_users_to_fix INT DEFAULT 100,
  _reason text DEFAULT 'Bulk system reconciliation'
)
RETURNS jsonb AS $$
DECLARE
  _fixed_count INT := 0;
  _total_discrepancy numeric := 0;
  _audit_id uuid;
  _admin_id uuid;
  _row RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _admin_id := auth.uid();

  -- Fix all users with discrepancies (limited to _max_users_to_fix)
  FOR _row IN
    SELECT user_id, account_type, current_balance, calculated_balance, balance_discrepancy
    FROM public.user_ledger_summary
    WHERE balance_discrepancy <> 0
    LIMIT _max_users_to_fix
  LOOP
    -- Update balance
    UPDATE public.profiles
    SET
      balance_usd = CASE WHEN _row.account_type::public.account_type = 'real'::public.account_type THEN _row.calculated_balance ELSE balance_usd END,
      demo_balance_usd = CASE WHEN _row.account_type::public.account_type = 'demo'::public.account_type THEN _row.calculated_balance ELSE demo_balance_usd END,
      updated_at = now()
    WHERE id = _row.user_id;

    -- Log the correction
    INSERT INTO public.balance_audit_log (
      user_id,
      account_type,
      audit_type,
      previous_balance,
      new_balance,
      calculated_balance,
      discrepancy,
      source,
      reason,
      corrected,
      created_by
    ) VALUES (
      _row.user_id,
      _row.account_type,
      'correction',
      _row.current_balance,
      _row.calculated_balance,
      _row.calculated_balance,
      ABS(_row.balance_discrepancy),
      'reconcile_all_balances',
      _reason,
      true,
      _admin_id
    );

    _fixed_count := _fixed_count + 1;
    _total_discrepancy := _total_discrepancy + ABS(_row.balance_discrepancy);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'fixed_count', _fixed_count,
    'total_discrepancy', ROUND(_total_discrepancy::numeric, 2),
    'message', 'Reconciliation completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.audit_user_balance(uuid, public.account_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_user_balance(uuid, public.account_type, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_all_balances(int, text) TO authenticated;
GRANT SELECT ON public.user_ledger_summary TO authenticated;
GRANT SELECT ON public.balance_audit_log TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
