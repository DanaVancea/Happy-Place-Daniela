// Fonction Edge « inviter-utilisateur » : envoie un e-mail d'invitation (lien de connexion)
// à une nouvelle personne. Réservée aux admins.
//
// Déploiement : supabase functions deploy inviter-utilisateur
// (les variables SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournies par Supabase).
// L'adresse du site (redirectTo) doit être dans Authentication > URL Configuration > Redirect URLs.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Qui appelle ? Il doit être admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  const callerEmail = caller?.user?.email?.toLowerCase();
  if (callerError || !callerEmail) return json({ error: "Connexion requise" }, 401);
  const { data: row } = await admin
    .from("allowed_users")
    .select("id, allowed_user_roles(role)")
    .eq("email", callerEmail)
    .maybeSingle();
  const role = (row as { allowed_user_roles?: { role?: string } | null } | null)?.allowed_user_roles?.role;
  if (role !== "admin") return json({ error: "Réservé aux admins" }, 403);

  // 2. Qui inviter ? Il doit déjà figurer dans la liste (créé par l'admin dans l'onglet).
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Adresse e-mail invalide" }, 400);
  const { data: target } = await admin.from("allowed_users").select("id").eq("email", email).maybeSingle();
  if (!target) return json({ error: "Cette personne n'est pas dans la liste des utilisateurs" }, 400);

  // 3. Invitation par e-mail (lien de connexion).
  const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    return json({ error: already ? "Cette personne a déjà un compte de connexion" : error.message }, 400);
  }
  return json({ ok: true });
});
