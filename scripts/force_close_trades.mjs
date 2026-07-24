import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = '1f79f9f5-fc9b-4108-817b-02013fcd33be';

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: trades, error: tradeLoadErr } = await supabase
  .from('trades')
  .select('id, stake, account_type, status')
  .eq('user_id', userId)
  .eq('module', 'binary')
  .eq('status', 'open')
  .order('created_at', { ascending: false });

if (tradeLoadErr) {
  console.error('Failed loading open trades', tradeLoadErr);
  process.exit(1);
}

console.log(`Loaded ${trades.length} open trades`);
for (const trade of trades) {
  const accountType = trade.account_type === 'demo' ? 'demo' : 'real';
  const balanceField = accountType === 'demo' ? 'demo_balance_usd' : 'balance_usd';
  const stake = Number(trade.stake ?? 0);

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select(balanceField)
    .eq('id', userId)
    .single();

  if (profileErr) {
    console.error('Failed loading profile', profileErr);
    process.exit(1);
  }

  const { error: updateErr } = await supabase
    .from('trades')
    .update({
      status: 'cancelled',
      payout: stake,
      closed_at: new Date().toISOString(),
      meta: { cancelled_by_system: true, reason: 'force_close_trades_script' },
    })
    .eq('id', trade.id)
    .eq('status', 'open');

  if (updateErr) {
    console.error(`Failed updating trade ${trade.id}`, updateErr);
    process.exit(1);
  }

  const { error: balanceErr } = await supabase
    .from('profiles')
    .update({ [balanceField]: Number(profile?.[balanceField] ?? 0) + stake })
    .eq('id', userId);

  if (balanceErr) {
    console.error(`Failed refunding trade ${trade.id}`, balanceErr);
    process.exit(1);
  }

  const { error: txnErr } = await supabase.from('transactions').insert({
    user_id: userId,
    kind: 'trade_payout',
    method: 'system',
    account_type: accountType,
    amount: stake,
    currency: 'USD',
    amount_usd: stake,
    status: 'completed',
    is_virtual: accountType === 'demo',
    meta: { trade_id: trade.id, reason: 'force_close_trades_script' },
  });

  if (txnErr) {
    console.error(`Failed writing payout transaction for ${trade.id}`, txnErr);
    process.exit(1);
  }

  console.log(`Forced close/cancel trade ${trade.id}`);
}

const { data: remaining, error: remainingErr } = await supabase
  .from('trades')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('module', 'binary')
  .eq('status', 'open');

if (remainingErr) {
  console.error('Failed counting remaining open trade rows', remainingErr);
  process.exit(1);
}

console.log(`Remaining open rows after cleanup: ${remaining?.length ?? 0}`);
