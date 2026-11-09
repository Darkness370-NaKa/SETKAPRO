import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration error" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (action === "create") {
      await admin.from("qr_login_requests").delete().lt("expires_at", new Date().toISOString());
      const id = crypto.randomUUID(), qrToken = randomToken(), desktopToken = randomToken();
      const expiresAt = new Date(Date.now() + 120_000).toISOString();
      const { error } = await admin.from("qr_login_requests").insert({ id, qr_token_hash: await sha256(qrToken), desktop_token_hash: await sha256(desktopToken), status: "pending", expires_at: expiresAt });
      if (error) return json({ error: "Could not create login request" }, 500);
      return json({ id, qr_token: qrToken, desktop_token: desktopToken, expires_at: expiresAt });
    }
    if (action === "approve") {
      const requestId = String(body?.request_id || ""), qrToken = String(body?.qr_token || "");
      const bearer = req.headers.get("Authorization")?.replace(/^Bearer\\s+/i, "");
      if (!bearer) return json({ error: "Sign in on this phone first" }, 401);
      const { data: authData, error: authError } = await admin.auth.getUser(bearer);
      if (authError || !authData.user?.id || !authData.user.email) return json({ error: "Your session is invalid. Sign in again." }, 401);
      if (!requestId || !qrToken) return json({ error: "Invalid QR request" }, 400);
      const qrHash = await sha256(qrToken);
      const { data: request, error: lookupError } = await admin.from("qr_login_requests").select("id").eq("id", requestId).eq("qr_token_hash", qrHash).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
      if (lookupError || !request) return json({ error: "QR code expired or already used" }, 410);
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: authData.user.email });
      const tokenHash = linkData?.properties?.hashed_token;
      if (linkError || !tokenHash) return json({ error: "Could not authorize this device" }, 500);
      const { data: updated, error: updateError } = await admin.from("qr_login_requests").update({ status: "approved", user_id: authData.user.id, approved_email: authData.user.email, auth_token_hash: tokenHash, approved_at: new Date().toISOString() }).eq("id", requestId).eq("qr_token_hash", qrHash).eq("status", "pending").gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (updateError || !updated) return json({ error: "QR request was already used or expired" }, 409);
      return json({ approved: true });
    }
    if (action === "poll") {
      const requestId = String(body?.request_id || ""), desktopToken = String(body?.desktop_token || "");
      if (!requestId || !desktopToken) return json({ error: "Invalid login request" }, 400);
      const { data, error } = await admin.from("qr_login_requests").select("status,approved_email").eq("id", requestId).eq("desktop_token_hash", await sha256(desktopToken)).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error || !data) return json({ error: "QR request expired" }, 410);
      return json({ status: data.status, email: data.approved_email });
    }
    if (action === "exchange") {
      const requestId = String(body?.request_id || ""), desktopToken = String(body?.desktop_token || "");
      if (!requestId || !desktopToken) return json({ error: "Invalid login request" }, 400);
      const { data, error } = await admin.from("qr_login_requests").update({ status: "consumed" }).eq("id", requestId).eq("desktop_token_hash", await sha256(desktopToken)).eq("status", "approved").gt("expires_at", new Date().toISOString()).select("auth_token_hash").maybeSingle();
      if (error || !data?.auth_token_hash) return json({ error: "Login approval expired or already used" }, 410);
      return json({ token_hash: data.auth_token_hash });
    }
    return json({ error: "Unknown action" }, 400);
  } catch { return json({ error: "Invalid request" }, 400); }
});
