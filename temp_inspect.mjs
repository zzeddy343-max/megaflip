import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [key, ...rest] = line.split('=');
      return [key, rest.join('=')];
    }),
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('missing env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = await Promise.all([
  supabase
    .from('information_schema.routines')
    .select('routine_name,routine_definition')
    .eq('specific_schema', 'public')
    .in('routine_name', [
      'cancel_open_trade',
      'release_stale_binary_trades',
      'settle_trade',
      'admin_settle_open_trade',
    ])
    .limit(20),
  supabase
    .from('information_schema.routines')
    .select('routine_name,routine_definition')
    .eq('specific_schema', 'public')
    .ilike('routine_definition', '%completed%')
    .limit(50),
]);

console.log(JSON.stringify(results, null, 2));
