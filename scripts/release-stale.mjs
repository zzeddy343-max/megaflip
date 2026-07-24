#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const [,, userId] = process.argv;
if (!userId) {
  console.error('Usage: node scripts/release-stale.mjs <userId>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
});

function isEnumError(msg) {
  if (!msg) return false;
  return /invalid input value for enum trade_status/i.test(msg);
}

(async () => {
  try {
    const staleBefore = new Date(Date.now() - 60_000).toISOString();
    console.log('Fetching stale trades for', userId, 'before', staleBefore);
    const { data: staleTrades, error } = await supabase
      .from('trades')
      .select('id,stake,account_type')
      .eq('user_id', userId)
      .eq('module', 'binary')
      .eq('status', 'open')
      .lt('created_at', staleBefore)
      .limit(1000);

    if (error) throw error;
    let released = 0;

    for (const trade of staleTrades ?? []) {
      try {
        const { error: rpcError } = await supabase.rpc('cancel_open_trade', { _trade_id: trade.id });
        if (!rpcError) {
          console.log('[RPC] cancelled', trade.id);
          released += 1;
          continue;
        }

        const msg = rpcError.message ?? String(rpcError);
        if (/Trade not found/i.test(msg)) {
          console.warn('[RPC] Trade not found, skipping', trade.id, msg);
          continue;
        }

        if (!isEnumError(msg)) {
          console.error('[RPC] cancel_open_trade failed for', trade.id, msg);
          continue;
        }

        console.warn('[RPC] enum error, falling back to direct update for', trade.id);

        // Direct fallback: mark cancelled and refund
        const stake = Number(trade.stake ?? 0);
        const closed_at = new Date().toISOString();
        const meta = { cancelled_by_system: true, reason: 'stale_binary_timeout' };

        const { data: cancelled, error: cancelErr } = await supabase
          .from('trades')
          .update({ status: 'cancelled', payout: stake, closed_at, meta })
          .eq('id', trade.id)
          .eq('status', 'open')
          .select('id,stake,account_type,user_id')
          .maybeSingle();
        if (cancelErr) throw cancelErr;
        if (!cancelled) continue;

        const account = cancelled.account_type === 'demo' ? 'demo' : 'real';
        const balanceField = account === 'demo' ? 'demo_balance_usd' : 'balance_usd';

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select(balanceField)
          .eq('id', cancelled.user_id)
          .single();
        if (profileErr) throw profileErr;

        const { error: balanceErr } = await supabase
          .from('profiles')
          .update({ [balanceField]: Number(profile?.[balanceField] ?? 0) + stake })
          .eq('id', cancelled.user_id);
        if (balanceErr) throw balanceErr;

        const { error: txErr } = await supabase.from('transactions').insert({
          user_id: cancelled.user_id,
          kind: 'trade_payout',
          method: 'system',
          account_type: account,
          amount: stake,
          currency: 'USD',
          amount_usd: stake,
          status: 'completed',
          is_virtual: account === 'demo',
          meta: { trade_id: cancelled.id, reason: 'stale_binary_timeout' },
        });
        if (txErr) throw txErr;

        console.log('[Fallback] cancelled and refunded', trade.id);
        released += 1;
      } catch (e) {
        console.error('Failed processing trade', trade.id, e instanceof Error ? e.message : String(e));
      }
    }

    console.log('Released count:', released);
    process.exit(0);
  } catch (e) {
    console.error('Script error', e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
})();
