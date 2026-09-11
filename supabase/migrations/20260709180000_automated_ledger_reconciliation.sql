-- AUTOMATED LEDGER RECONCILIATION SYSTEM
-- Automatically audits and fixes balance discrepancies without manual intervention
-- Keeps manual admin buttons for explicit control when needed

-- ============================================================================
-- 1. LEDGER RECONCILIATION SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ledger_reconciliation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean DEFAULT true,
  auto_fix_enabled boolean DEFAULT true,
  audit_interval_minutes INT DEFAULT 60,
  last_audit_at timestamptz,
  last_fix_at timestamptz,
  discrepancies_found INT DEFAULT 0,
  discrepancies_fixed INT DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.ledger_reconciliation_config (enabled, auto_fix_enabled, audit_interval_minutes)
VALUES (true, true, 60)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. AUTO-RECONCILE FUNCTION - Called by triggers on transaction/trade completion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_reconcile_user_balance()
RETURNS TRIGGER AS $$
DECLARE
  _result jsonb;
BEGIN
  -- Get the user_id and account_type from the changed row
  DECLARE
    _user_id uuid;
    _account_type public.account_type;
  BEGIN
    IF TG_TABLE_NAME = 'transactions' THEN
      _user_id := NEW.user_id;
      _account_type := NEW.account_type;
    ELSIF TG_TABLE_NAME = 'trades' THEN
      _user_id := NEW.user_id;
      _account_type := NEW.account_type;
    END IF;

    -- Only reconcile if:
    -- 1. Reconciliation is enabled
    -- 2. Auto-fix is enabled
    -- 3. Transaction/trade is now in a final state
    IF EXISTS (SELECT 1 FROM public.ledger_reconciliation_config WHERE enabled AND auto_fix_enabled) THEN
      -- For transactions: reconcile when status changes to completed, failed, cancelled
      IF TG_TABLE_NAME = 'transactions' AND NEW.status IN ('completed', 'failed', 'cancelled') THEN
        _result := public.reconcile_user_balance(_user_id, _account_type, 'Auto-reconciliation on transaction: ' || TG_OP);
      -- For trades: reconcile when status changes to won, lost, cancelled, closed
      ELSIF TG_TABLE_NAME = 'trades' AND NEW.status IN ('won', 'lost', 'cancelled', 'closed') THEN
        _result := public.reconcile_user_balance(_user_id, _account_type, 'Auto-reconciliation on trade: ' || TG_OP);
      END IF;
    END IF;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for automatic reconciliation
DROP TRIGGER IF EXISTS auto_reconcile_transactions ON public.transactions CASCADE;
CREATE TRIGGER auto_reconcile_transactions
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.auto_reconcile_user_balance();

DROP TRIGGER IF EXISTS auto_reconcile_trades ON public.trades CASCADE;
CREATE TRIGGER auto_reconcile_trades
AFTER UPDATE OF status ON public.trades
FOR EACH ROW
EXECUTE FUNCTION public.auto_reconcile_user_balance();

-- ============================================================================
-- 3. SCHEDULED AUDIT & FIX FUNCTION - Run periodically via cron or edge function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_scheduled_ledger_reconciliation()
RETURNS jsonb AS $$
DECLARE
  _config RECORD;
  _audit_results RECORD;
  _fix_count INT := 0;
  _discrepancy_count INT := 0;
  _total_amount numeric := 0;
  _audit_details jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    -- Allow system function to run without auth check
    -- (when called from scheduled job)
  END IF;

  -- Get config
  SELECT * INTO _config FROM public.ledger_reconciliation_config LIMIT 1;

  IF NOT _config.enabled OR NOT _config.auto_fix_enabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'disabled',
      'message', 'Automated reconciliation is disabled'
    );
  END IF;

  -- Check if enough time has passed since last audit
  IF _config.last_audit_at IS NOT NULL AND 
     (now() - _config.last_audit_at) < ((_config.audit_interval_minutes || ' minutes')::interval) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'skipped',
      'message', 'Audit interval not reached yet',
      'next_audit_in', EXTRACT(EPOCH FROM ((_config.last_audit_at + (_config.audit_interval_minutes || ' minutes')::interval) - now())) || ' seconds'
    );
  END IF;

  -- Run audit on all users
  FOR _audit_results IN
    SELECT * FROM public.audit_user_balance()
    WHERE discrepancy <> 0
  LOOP
    _discrepancy_count := _discrepancy_count + 1;
    _total_amount := _total_amount + ABS(_audit_results.discrepancy);

    -- Auto-fix this user's account
    PERFORM public.reconcile_user_balance(
      _audit_results.user_id,
      _audit_results.account_type,
      'Automated scheduled reconciliation'
    );

    _fix_count := _fix_count + 1;

    -- Add to details (limit to first 10 for brevity)
    IF _discrepancy_count <= 10 THEN
      _audit_details := _audit_details || jsonb_build_array(
        jsonb_build_object(
          'user_id', _audit_results.user_id,
          'username', _audit_results.username,
          'account_type', _audit_results.account_type,
          'discrepancy', _audit_results.discrepancy,
          'status', _audit_results.status
        )
      );
    END IF;
  END LOOP;

  -- Update config
  UPDATE public.ledger_reconciliation_config
  SET
    last_audit_at = now(),
    last_fix_at = CASE WHEN _fix_count > 0 THEN now() ELSE last_fix_at END,
    discrepancies_found = discrepancies_found + _discrepancy_count,
    discrepancies_fixed = discrepancies_fixed + _fix_count,
    updated_at = now()
  WHERE id = _config.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'completed',
    'discrepancies_found', _discrepancy_count,
    'accounts_fixed', _fix_count,
    'total_amount_corrected', ROUND(_total_amount::numeric, 2),
    'audit_details', _audit_details,
    'message', CASE
      WHEN _fix_count = 0 THEN 'Audit completed: all balances are correct'
      ELSE 'Audit completed: ' || _fix_count || ' accounts reconciled'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. ENABLE/DISABLE AUTO-RECONCILIATION FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_auto_reconciliation_enabled(enabled boolean)
RETURNS jsonb AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.ledger_reconciliation_config
  SET auto_fix_enabled = enabled, updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'auto_fix_enabled', enabled,
    'message', CASE
      WHEN enabled THEN 'Auto-reconciliation enabled'
      ELSE 'Auto-reconciliation disabled - manual only'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_reconciliation_status()
RETURNS jsonb AS $$
DECLARE
  _config RECORD;
  _pending_discrepancies INT;
BEGIN
  SELECT * INTO _config FROM public.ledger_reconciliation_config LIMIT 1;

  -- Count users with discrepancies
  SELECT COUNT(*) INTO _pending_discrepancies
  FROM public.user_ledger_summary
  WHERE balance_discrepancy <> 0;

  RETURN jsonb_build_object(
    'enabled', _config.enabled,
    'auto_fix_enabled', _config.auto_fix_enabled,
    'audit_interval_minutes', _config.audit_interval_minutes,
    'last_audit_at', _config.last_audit_at,
    'last_fix_at', _config.last_fix_at,
    'discrepancies_found_lifetime', _config.discrepancies_found,
    'discrepancies_fixed_lifetime', _config.discrepancies_fixed,
    'pending_discrepancies', _pending_discrepancies,
    'next_scheduled_audit', CASE
      WHEN _config.last_audit_at IS NULL THEN 'Immediate'
      ELSE (_config.last_audit_at + (_config.audit_interval_minutes || ' minutes')::interval)::text
    END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. PERMISSIONS & SCHEDULING
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.auto_reconcile_user_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_scheduled_ledger_reconciliation() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_auto_reconciliation_enabled(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reconciliation_status() TO authenticated;
GRANT SELECT ON public.ledger_reconciliation_config TO authenticated;

-- ============================================================================
-- 6. SCHEDULED JOB SETUP (via pg_cron if available)
-- ============================================================================

-- Enable pg_cron extension (must be enabled in Supabase project settings)
-- For Supabase: Use Edge Functions with Supabase Deno runtime scheduled via cron
-- Or manually trigger via application cron every hour

-- Example pg_cron command (if extension is enabled):
-- SELECT cron.schedule('ledger-auto-reconcile', '*/60 * * * *', 'SELECT public.run_scheduled_ledger_reconciliation()');

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
