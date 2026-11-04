import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Nouvelle table non présente dans les types générés : client non typé.
const db = supabase as unknown as SupabaseClient;

/** Événement émis par le lien « Aide » pour relancer le parcours. */
export const ONBOARDING_EVENT = "happy-place:onboarding";

export type OnboardingRole = "collaborateur" | "manager" | "admin";

export type OnboardingStep = {
  icon: string;
  title: string;
  intro: string;
  points: string[];
};

/** Vrai si le compte n'a jamais terminé ni passé le parcours. En cas d'erreur (ex. migration non exécutée), on n'affiche rien. */
export async function shouldShowOnboarding(userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("onboarding_status")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !data;
}

export async function finishOnboarding(skipped: boolean): Promise<void> {
  const { error } = await db.rpc("terminer_onboarding", { _skipped: skipped });
  if (error) throw error;
}

/** Quatre écrans courts, adaptés au rôle. */
export function stepsForRole(role: string | null | undefined): OnboardingStep[] {
  const r: OnboardingRole =
    role === "admin" ? "admin" : role === "manager" ? "manager" : "collaborateur";

  const discover: OnboardingStep = {
    icon: "explore",
    title: "Ce que tu peux faire ici",
    intro: "Happy Place réunit l'essentiel de la vie de l'entreprise au même endroit.",
    points: [
      "Trombi : retrouve qui est qui, par équipe.",
      "Actualités : suis les annonces et les indicateurs de l'entreprise.",
      "Boîte à idées : propose une amélioration pour ton équipe.",
      "Points bloquants : signale ce qui t'empêche d'avancer.",
      ...(r === "admin" ? ["Impact : mesure l'usage de l'application (réservé aux admins)."] : []),
    ],
  };

  const news: OnboardingStep = {
    icon: "campaign",
    title: "Qui publie les actualités ?",
    intro:
      r === "admin"
        ? "Tu fais partie des admins RH, DSI ou Office management : tu peux publier."
        : "Seuls les admins RH, DSI et Office management publient les actualités.",
    points:
      r === "admin"
        ? [
            "Publie depuis « Gérer les actualités ».",
            "Ton nom d'auteur n'est visible que des admins ; les autres voient ton département.",
          ]
        : [
            "Tu vois le département à l'origine de chaque actualité.",
            "Un « Lu » et des favoris t'aident à ne rien manquer.",
          ],
  };

  const statuses: OnboardingStep = {
    icon: "published_with_changes",
    title: "Suivre tes idées et tes points bloquants",
    intro: "Chaque idée et chaque point bloquant a un statut visible, de l'envoi au traitement.",
    points:
      r === "collaborateur"
        ? [
            "Tu envoies une idée pour ton équipe ; ton manager la traite.",
            "Tu reçois un e-mail quand le statut de ton idée change.",
            "Tu peux commenter et soutenir les idées des autres.",
          ]
        : [
            "Les idées de tes équipes arrivent en attente : valide-les, refuse-les ou remonte-les.",
            "Le collaborateur reçoit un e-mail à chaque changement de statut.",
            ...(r === "admin" ? ["Tu traites aussi les idées remontées à la boîte."] : []),
          ],
  };

  const last: OnboardingStep =
    r === "collaborateur"
      ? {
          icon: "rocket_launch",
          title: "À toi de jouer",
          intro: "Commence par une action simple.",
          points: [
            "Complète ton profil dans le Trombi.",
            "Lis les dernières actualités.",
            "Dépose ta première idée.",
            "Besoin de revoir ce parcours ? Utilise le lien « Aide » en haut de page.",
          ],
        }
      : {
          icon: "notifications_active",
          title: "Pense à te connecter régulièrement",
          intro:
            "Les idées de tes équipes attendent ta réponse : plus elle est rapide, plus les collaborateurs participent.",
          points: [
            "Un compteur sur « Boîte à idées » t'indique ce qui est à traiter.",
            "Passe au moins une fois par semaine.",
            "Besoin de revoir ce parcours ? Utilise le lien « Aide » en haut de page.",
          ],
        };

  return [discover, news, statuses, last];
}
