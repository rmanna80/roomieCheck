/**
 * delete-account — permanently deletes the *calling* user.
 *
 * The caller's JWT is verified with Supabase Auth; only then is the admin API used to delete
 * that same user id. Deleting the auth user cascades through the database (see
 * migrations: profiles → memberships trigger → cleanup), so housemates' homes keep working.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('unauthorized', { status: 401, headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) return new Response('unauthorized', { status: 401, headers: cors });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) return new Response(deleteError.message, { status: 500, headers: cors });

  return new Response(JSON.stringify({ deleted: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
