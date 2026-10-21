const SUPABASE_URL = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
/** Verifikasi token Supabase pengguna dan ambil perannya dari public.profiles (melalui RLS). */
async function getCaller(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const h = { apikey: ANON, Authorization: 'Bearer ' + token };
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,nama`, { headers: h });
  const rows = p.ok ? await p.json() : [];
  return { user, token, role: (rows[0] || {}).role || 'pending', nama: (rows[0] || {}).nama || '', headers: h };
}
module.exports = { getCaller, SUPABASE_URL, ANON };
