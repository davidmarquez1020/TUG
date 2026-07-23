import { createClient } from "@supabase/supabase-js";

// service-role client — bypasses RLS, server-side only, never expose this key to the client
export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// resolves the calling user's id from the Supabase access token in the
// Authorization header — returns null if missing/invalid rather than throwing,
// so callers can uniformly respond 401.
export async function getCallerUserId(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
