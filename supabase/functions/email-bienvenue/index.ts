// Fonction Edge « email-bienvenue » : envoie un e-mail de bienvenue (via Resend) dès qu'un
// compte de connexion est créé. Elle est appelée par un webhook de base de données
// (trigger sur auth.users, voir la migration 20261104090000_email_bienvenue.sql).
//
// Secrets à définir (Supabase > Edge Functions > Secrets, ou `supabase secrets set ...`) :
//   RESEND_API_KEY   clé API Resend
//   MAIL_FROM        expéditeur, ex. « Happy Place <bienvenue@ton-domaine.fr> »
//   WEBHOOK_SECRET   mot de passe partagé avec le trigger (même valeur que dans la migration)
//   SITE_URL         (facultatif) adresse du site, par défaut celle de production
//
// Déploiement : supabase functions deploy email-bienvenue --no-verify-jwt
// (--no-verify-jwt car l'appelant est la base de données ; l'accès est protégé par WEBHOOK_SECRET)
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://happy-place-daniela.vancea-florentina-daniela.workers.dev").replace(/\/$/, "");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Couleurs du design system (Happy_placedesign.md), converties de oklch en hexadécimal :
// écru, anthracite, rose poudré. Polices avec repli : les clients mail n'ont pas toujours Comfortaa/Inter.
const C = {
  ecru: "#F6F5F0",
  carte: "#FFFFFF",
  texte: "#3A3A40",
  discret: "#74747C",
  anthracite: "#2B2C2D",
  surAnthracite: "#FAF9F5",
  rose: "#F3DEDB",
  bordure: "#E9E8E2",
};
const TITRE = "Comfortaa, 'Trebuchet MS', Arial, sans-serif";
const CORPS = "Inter, Arial, Helvetica, sans-serif";

function bouton(href: string, label: string, principal: boolean) {
  const fond = principal ? C.anthracite : C.rose;
  const encre = principal ? C.surAnthracite : C.anthracite;
  return `<a href="${href}" style="display:inline-block;padding:12px 22px;margin:0 8px 8px 0;border-radius:8px;background:${fond};color:${encre};font-family:${CORPS};font-size:15px;font-weight:600;text-decoration:none">${label}</a>`;
}

export function gabarit(prenom: string | null) {
  const salut = prenom ? `Bienvenue, ${esc(prenom)} !` : "Bienvenue !";
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:${C.ecru}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ecru};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.carte};border:1px solid ${C.bordure};border-radius:8px">
<tr><td style="padding:32px 32px 8px;font-family:${TITRE};font-size:14px;color:${C.discret}">Happy Place</td></tr>
<tr><td style="padding:0 32px"><h1 style="margin:0;font-family:${TITRE};font-size:26px;line-height:1.3;color:${C.anthracite}">${salut}</h1></td></tr>
<tr><td style="padding:16px 32px 8px;font-family:${CORPS};font-size:15px;line-height:1.6;color:${C.texte}">
Ton compte est prêt. Happy Place est l'intranet de Bigger Boat : voici deux endroits pour bien commencer.
</td></tr>
<tr><td style="padding:8px 32px 0;font-family:${CORPS};font-size:15px;line-height:1.6;color:${C.texte}">
<p style="margin:0 0 4px"><strong>Le Trombi</strong> : retrouve les équipes et fais connaissance avec tes collègues.</p>
<p style="margin:0 0 4px"><strong>La Boîte à idées</strong> : propose une idée pour ton équipe ou soutiens celles des autres.</p>
</td></tr>
<tr><td style="padding:20px 32px 8px">${bouton(`${SITE_URL}/trombi`, "Voir le Trombi", true)}${bouton(`${SITE_URL}/idees`, "Ouvrir la Boîte à idées", false)}</td></tr>
<tr><td style="padding:16px 32px 32px;font-family:${CORPS};font-size:12px;line-height:1.5;color:${C.discret}">Tu reçois cet e-mail car un compte Happy Place vient d'être créé à ton adresse.</td></tr>
</table></td></tr></table></body></html>`;
  const texte = `${salut}\n\nTon compte Happy Place est prêt.\n\nLe Trombi : ${SITE_URL}/trombi\nLa Boîte à idées : ${SITE_URL}/idees\n`;
  return { html, texte };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET") || !Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Non autorisé", { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const email = String(payload?.record?.email ?? "").trim().toLowerCase();
  if (payload?.type !== "INSERT" || !email) return new Response("Ignoré", { status: 200 });

  // Prénom si on le connaît déjà (compte créé par un admin) ; sinon salutation sans prénom.
  let prenom: string | null = null;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await admin.from("allowed_users").select("first_name").eq("email", email).maybeSingle();
  prenom = (data as { first_name?: string | null } | null)?.first_name?.trim() || null;

  const { html, texte } = gabarit(prenom);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MAIL_FROM"),
      to: [email],
      subject: "Bienvenue sur Happy Place",
      html,
      text: texte,
    }),
  });
  if (!res.ok) {
    console.error("Resend a refusé l'envoi", res.status, await res.text());
    return new Response("Échec de l'envoi", { status: 502 });
  }
  return new Response("ok", { status: 200 });
});
