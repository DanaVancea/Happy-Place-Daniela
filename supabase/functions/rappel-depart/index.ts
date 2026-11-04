// Fonction Edge « rappel-depart » : envoie aux admins un e-mail de rappel avant le départ d'un
// collaborateur (premier rappel 2 jours ouvrés avant, relance le jour J), pour qu'ils téléchargent
// ses données (Gestion des utilisateurs > export). Appelée chaque jour par pg_cron via pg_net
// (voir la migration 20261104210000_rappel_depart_email_admins.sql).
//
// Secrets (les mêmes que « email-bienvenue ») : BREVO_API_KEY, MAIL_FROM, WEBHOOK_SECRET, SITE_URL (facultatif).
// Déploiement : supabase functions deploy rappel-depart --no-verify-jwt
//
// Le mail ne contient aucune donnée personnelle : seulement le nom, la date et un lien.
// Les envois sont notés (colonnes depart_rappel_*_at + journal admin) UNIQUEMENT si Brevo a accepté
// le mail ; en cas d'échec, le cron réessaie le lendemain. La fonction est idempotente.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://happy-place-daniela.vancea-florentina-daniela.workers.dev").replace(/\/$/, "");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Couleurs du design system (écru, anthracite, rose poudré), comme email-bienvenue.
const C = { ecru: "#F6F5F0", carte: "#FFFFFF", texte: "#3A3A40", discret: "#74747C", anthracite: "#2B2C2D", surAnthracite: "#FAF9F5", bordure: "#E9E8E2" };
const TITRE = "Comfortaa, 'Trebuchet MS', Arial, sans-serif";
const CORPS = "Inter, Arial, Helvetica, sans-serif";

const dateFr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function gabarit(kind: "j2" | "j0", nom: string, date: string) {
  const titre = kind === "j0" ? "Départ aujourd'hui : données pas encore téléchargées" : "Un départ approche : pense à télécharger les données";
  const phrase =
    kind === "j0"
      ? `<strong>${esc(nom)}</strong> quitte l'entreprise aujourd'hui (${dateFr(date)}) et ses données n'ont pas encore été téléchargées. Télécharge-les avant de supprimer son compte : la suppression est définitive.`
      : `<strong>${esc(nom)}</strong> part le ${dateFr(date)}, dans 2 jours ouvrés. Télécharge ses données avant son départ, puis supprime son compte.`;
  const lien = `${SITE_URL}/utilisateurs`;
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:${C.ecru}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ecru};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.carte};border:1px solid ${C.bordure};border-radius:8px">
<tr><td style="padding:32px 32px 8px;font-family:${TITRE};font-size:14px;color:${C.discret}">Happy Place</td></tr>
<tr><td style="padding:0 32px"><h1 style="margin:0;font-family:${TITRE};font-size:22px;line-height:1.3;color:${C.anthracite}">${titre}</h1></td></tr>
<tr><td style="padding:16px 32px 8px;font-family:${CORPS};font-size:15px;line-height:1.6;color:${C.texte}">${phrase}</td></tr>
<tr><td style="padding:20px 32px 8px"><a href="${lien}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${C.anthracite};color:${C.surAnthracite};font-family:${CORPS};font-size:15px;font-weight:600;text-decoration:none">Ouvrir Gestion des utilisateurs</a></td></tr>
<tr><td style="padding:16px 32px 32px;font-family:${CORPS};font-size:12px;line-height:1.5;color:${C.discret}">Tu reçois cet e-mail car tu es admin Happy Place. Il s'arrête dès que les données sont téléchargées.</td></tr>
</table></td></tr></table></body></html>`;
  const texte = `${titre}\n\n${kind === "j0" ? `${nom} quitte l'entreprise aujourd'hui (${dateFr(date)}).` : `${nom} part le ${dateFr(date)}, dans 2 jours ouvrés.`}\nTélécharge ses données : ${lien}\n`;
  return { html, texte, subject: kind === "j0" ? `Départ aujourd'hui : ${nom}` : `Départ le ${dateFr(date)} : ${nom}` };
}

function expediteur(from: string) {
  const m = from.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  return m ? { name: (m[1] || "Happy Place").trim(), email: m[2].trim() } : { name: "Happy Place", email: from.trim() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("Non autorisé", { status: 401 });

  const payload = await req.json().catch(() => ({}));
  const kind = payload?.kind === "j0" ? "j0" : payload?.kind === "j2" ? "j2" : null;
  const userId = String(payload?.user_id ?? "");
  if (!kind || !userId) return new Response("Ignoré", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const col = kind === "j0" ? "depart_rappel_j0_at" : "depart_rappel_j2_at";

  // On relit tout : le départ a pu être annulé, modifié, exporté ou déjà notifié depuis l'appel du cron.
  const { data: u } = await admin
    .from("allowed_users")
    .select("id, email, first_name, last_name, departure_date, data_exported_at, depart_rappel_j2_at, depart_rappel_j0_at")
    .eq("id", userId)
    .maybeSingle();
  if (!u || !u.departure_date || u.data_exported_at || u[col]) return new Response("Rien à envoyer", { status: 200 });

  const nom = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email;

  // Destinataires : tous les admins, sauf la personne qui part.
  const { data: roles } = await admin
    .from("allowed_user_roles")
    .select("allowed_users!inner(email)")
    .eq("role", "admin");
  const destinataires = [
    ...new Set(
      (roles ?? [])
        .map((r: { allowed_users: { email: string } | { email: string }[] }) =>
          Array.isArray(r.allowed_users) ? r.allowed_users[0]?.email : r.allowed_users?.email)
        .filter((e): e is string => !!e && e.toLowerCase() !== String(u.email).toLowerCase()),
    ),
  ];
  if (destinataires.length === 0) return new Response("Aucun admin à prévenir", { status: 200 });

  const brevoKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoKey) return new Response("BREVO_API_KEY manquant", { status: 500 });
  const { html, texte, subject } = gabarit(kind, nom, u.departure_date);
  const sender = expediteur(Deno.env.get("MAIL_FROM") ?? "");

  // Un mail par admin : les adresses ne sont pas visibles entre admins.
  let envoyes = 0;
  for (const to of destinataires) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html, textContent: texte }),
    });
    if (res.ok) envoyes++;
    else console.error("Brevo a refusé l'envoi", res.status, await res.text());
  }
  // Rien n'est noté si aucun mail n'est parti : le cron réessaiera demain.
  if (envoyes === 0) return new Response("Échec de l'envoi", { status: 502 });

  const maintenant = new Date().toISOString();
  await admin.from("allowed_users").update({ [col]: maintenant }).eq("id", userId);
  if (kind === "j0") {
    // Si le premier rappel n'était pas parti (départ créé tard), on le considère comme couvert.
    await admin.from("allowed_users").update({ depart_rappel_j2_at: maintenant }).eq("id", userId).is("depart_rappel_j2_at", null);
  }
  await admin.from("admin_audit_log").insert({
    actor_email: "système",
    actor_name: "Système",
    action: kind === "j0" ? "Relance départ envoyée" : "Rappel départ envoyé",
    target: nom,
    details: `${envoyes}/${destinataires.length} admin(s) · départ le ${dateFr(u.departure_date)}`,
  });
  return new Response("ok", { status: 200 });
});
