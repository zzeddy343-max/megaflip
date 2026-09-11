import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const queries = [
    supabase
      .from('information_schema.columns')
      .select('table_name,column_name,data_type,udt_name')
      .eq('table_schema', 'public')
      .in('table_name', ['trades', 'transactions']),
    supabase
      .from('information_schema.routines')
      .select('routine_name,routine_definition')
      .eq('specific_schema', 'public')
      .in('routine_name', [
        'cancel_open_trade',
        'release_stale_binary_trades',
        'settle_trade',
        'create_transaction',
        'apply_transaction',
        'auto_reconcile_user_balance',
        'admin_settle_open_trade',
      ]),
    supabase
      .from('trades')
      .select('id,status,account_type,module,stake,meta,created_at')
      .eq('user_id', '1f79f9f5-fc9b-4108-817b-02013fcd33be')
      .eq('module', 'binary')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('information_schema.routines')
      .select('routine_name,routine_definition')
      .eq('specific_schema', 'public')
      .ilike('routine_definition', '%completed%')
      .limit(20),
  ]; 

  const results = await Promise.all(queries);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});