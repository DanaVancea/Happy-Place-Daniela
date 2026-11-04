// Fonction Edge « email-statut-idee » : prévient par e-mail l'auteur d'une idée de la Boîte à idées
// quand son statut change (validée, en débat, remontée, supprimée). Appelée par un trigger de base
// de données via pg_net (voir la migration 20261104220000_email_changement_statut_idee.sql).
//
// Secrets (les mêmes que « email-bienvenue ») : BREVO_API_KEY, MAIL_FROM, WEBHOOK_SECRET, SITE_URL (facultatif).
// Déploiement : supabase functions deploy email-statut-idee --no-verify-jwt
//
// Rafales : la fonction relit l'idée et compare son statut actuel à ideas.status_notified (dernier statut
// dont l'auteur a été prévenu). Si rien n'a changé depuis, elle ne fait rien ; sinon elle « réserve »
// l'envoi (mise à jour conditionnelle), envoie, et annule la réservation si Brevo refuse.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://happy-place-daniela.vancea-florentina-daniela.workers.dev").replace(/\/$/, "");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Couleurs du design system (écru, anthracite, rose poudré), comme email-bienvenue.
const C = { ecru: "#F6F5F0", carte: "#FFFFFF", texte: "#3A3A40", discret: "#74747C", anthracite: "#2B2C2D", surAnthracite: "#FAF9F5", rose: "#F3DEDB", bordure: "#E9E8E2" };
const TITRE = "Comfortaa, 'Trebuchet MS', Arial, sans-serif";
const CORPS = "Inter, Arial, Helvetica, sans-serif";

const MESSAGES: Record<string, { titre: string; phrase: string }> = {
  "validée": { titre: "Ton idée a été validée", phrase: "Bonne nouvelle : ton idée a été validée. Elle peut maintenant être mise en œuvre." },
  "en débat": { titre: "Ton idée est soumise au débat", phrase: "Ton idée est soumise au débat : ton équipe peut l'aimer et la commenter." },
  "remontée": { titre: "Ton idée est remontée à la société", phrase: "Ton idée a été remontée à la société : les admins vont la traiter." },
  "supprimée": { titre: "Ton idée n'a pas été retenue", phrase: "Ton idée n'a pas été retenue." },
  "en attente": { titre: "Ton idée est en attente", phrase: "Ton idée est de nouveau en attente d'une décision." },
};

export function extrait(texte: string, max = 90) {
  const t = texte.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export function gabarit(p: { ancien: string; nouveau: string; idee: string; par?: string | null; note?: string | null; noteLabel?: string }) {
  const m = MESSAGES[p.nouveau] ?? { titre: "Le statut de ton idée a changé", phrase: "Le statut de ton idée a changé." };
  const lien = `${SITE_URL}/idees`;
  const par = p.par ? ` par ${esc(p.par)}` : "";
  const note = p.note
    ? `<tr><td style="padding:8px 32px 0;font-family:${CORPS};font-size:14px;line-height:1.6;color:${C.texte}"><strong>${esc(p.noteLabel ?? "Message")} :</strong> ${esc(p.note)}</td></tr>`
    : "";
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:${C.ecru}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ecru};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.carte};border:1px solid ${C.bordure};border-radius:8px">
<tr><td style="padding:32px 32px 8px;font-family:${TITRE};font-size:14px;color:${C.discret}">Happy Place · Boîte à idées</td></tr>
<tr><td style="padding:0 32px"><h1 style="margin:0;font-family:${TITRE};font-size:22px;line-height:1.3;color:${C.anthracite}">${m.titre}</h1></td></tr>
<tr><td style="padding:16px 32px 8px;font-family:${CORPS};font-size:15px;line-height:1.6;color:${C.texte}">${m.phrase}</td></tr>
<tr><td style="padding:8px 32px"><div style="padding:12px 16px;background:${C.ecru};border-radius:8px;font-family:${CORPS};font-size:14px;line-height:1.5;color:${C.texte}">« ${esc(extrait(p.idee))} »</div></td></tr>
<tr><td style="padding:8px 32px 0;font-family:${CORPS};font-size:14px;line-height:1.6;color:${C.texte}">Statut : <span style="color:${C.discret}">${esc(p.ancien)}</span> → <strong>${esc(p.nouveau)}</strong>${par}</td></tr>
${note}
<tr><td style="padding:20px 32px 8px"><a href="${lien}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${C.anthracite};color:${C.surAnthracite};font-family:${CORPS};font-size:15px;font-weight:600;text-decoration:none">Voir la Boîte à idées</a></td></tr>
<tr><td style="padding:16px 32px 32px;font-family:${CORPS};font-size:12px;line-height:1.5;color:${C.discret}">Tu reçois cet e-mail parce que tu es l'auteur de cette idée.</td></tr>
</table></td></tr></table></body></html>`;
  const texte = `${m.titre}\n\n${m.phrase}\n« ${extrait(p.idee)} »\nStatut : ${p.ancien} → ${p.nouveau}${p.par ? ` par ${p.par}` : ""}\n${p.note ? `${p.noteLabel ?? "Message"} : ${p.note}\n` : ""}Boîte à idées : ${lien}\n`;
  return { html, texte, subject: `${m.titre} : « ${extrait(p.idee, 50)} »` };
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
  const ideaId = String(payload?.idea_id ?? "");
  if (!ideaId) return new Response("Ignoré", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // On relit l'idée : plusieurs changements ont pu se succéder depuis l'appel du trigger.
  const { data: idee } = await admin
    .from("ideas")
    .select("id, author_email, content, status, status_notified, moderated_by_name, deletion_reason, escalation_note")
    .eq("id", ideaId)
    .maybeSingle();
  if (!idee || idee.status === idee.status_notified) return new Response("Rien à envoyer", { status: 200 });

  // Destinataire : l'auteur, s'il est toujours dans l'entreprise.
  const { data: auteur } = await admin
    .from("allowed_users")
    .select("email, departure_date")
    .eq("email", String(idee.author_email).toLowerCase())
    .maybeSingle();
  const aujourdhui = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const parti = !auteur || (auteur.departure_date && auteur.departure_date <= aujourdhui);
  const ancien = idee.status_notified as string;
  if (parti) {
    // Rien à envoyer, mais on avance le curseur pour ne pas renvoyer plus tard un mail périmé.
    await admin.from("ideas").update({ status_notified: idee.status }).eq("id", ideaId);
    return new Response("Auteur non notifiable", { status: 200 });
  }

  const brevoKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoKey) return new Response("BREVO_API_KEY manquant", { status: 500 });

  // Réservation atomique : si un autre appel a déjà pris ce changement, on s'arrête.
  const { data: reserve } = await admin
    .from("ideas")
    .update({ status_notified: idee.status })
    .eq("id", ideaId)
    .eq("status_notified", ancien)
    .select("id");
  if (!reserve || reserve.length === 0) return new Response("Déjà traité", { status: 200 });

  const note = idee.status === "supprimée" ? idee.deletion_reason : idee.status === "remontée" ? idee.escalation_note : null;
  const { html, texte, subject } = gabarit({
    ancien,
    nouveau: idee.status,
    idee: idee.content,
    par: idee.moderated_by_name,
    note,
    noteLabel: idee.status === "supprimée" ? "Motif" : "Note",
  });
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: expediteur(Deno.env.get("MAIL_FROM") ?? ""),
      to: [{ email: auteur.email }],
      subject,
      htmlContent: html,
      textContent: texte,
    }),
  });
  if (!res.ok) {
    console.error("Brevo a refusé l'envoi", res.status, await res.text());
    // On annule la réservation : le prochain changement de statut enverra un mail.
    await admin.from("ideas").update({ status_notified: ancien }).eq("id", ideaId).eq("status_notified", idee.status);
    return new Response("Échec de l'envoi", { status: 502 });
  }
  return new Response("ok", { status: 200 });
});
