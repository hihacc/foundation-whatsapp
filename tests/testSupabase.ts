import { createClient } from '@supabase/supabase-js';

const url = 'https://jjdtimkrjpmvkypjtxli.supabase.co';
const key = 'sb_publishable_1Fxmt6u-If7rsnmkgQaUsQ_fWll30HX';

const client = createClient(url, key);

async function check() {
  console.log('Testing Supabase REST API connection...');
  const { data, error } = await client.from('whatsapp_accounts').select('*').limit(1);
  console.log('Result:', { data, error });
}

check();
