import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Les tables d'idées ne sont pas encore dans les types générés : client non typé.
const db = supabase as unknown as SupabaseClient;

export type IdeaStatus = "en attente" | "validée" | "en débat" | "remontée" | "supprimée";
export type ModerationAction = "valider" | "supprimer" | "debat" | "remonter";

export type Idea = {
  id: string;
  team: string;
  author_email: string;
  author_name: string;
  content: string;
  status: IdeaStatus;
  deletion_reason: string | null;
  moderated_by_name: string | null;
  moderated_at: string | null;
  escalation_note: string | null;
  created_at: string;
};

export type IdeaComment = {
  id: string;
  idea_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  "en attente": "En attente de modération",
  validée: "Validée · en mise en œuvre",
  "en débat": "En débat",
  remontée: "Remontée à la société",
  supprimée: "Refusée",
};

export async function fetchIdeas(): Promise<Idea[]> {
  const { data, error } = await db
    .from("ideas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Idea[];
}

export async function fetchTeams(): Promise<string[]> {
  const { data, error } = await db.from("teams").select("name").order("name");
  if (error) throw error;
  return (data ?? []).map((t: { name: string }) => t.name);
}

/** Équipe du compte connecté (collaborateur) et équipes dirigées (manager). */
export async function fetchMyTeams(
  email: string,
): Promise<{ team: string | null; managed: string[] }> {
  const { data: au, error } = await db
    .from("allowed_users")
    .select("id, team")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!au) return { team: null, managed: [] };
  const { data: mt, error: e2 } = await db
    .from("manager_teams")
    .select("team")
    .eq("allowed_user_id", au.id);
  if (e2) throw e2;
  return {
    team: au.team ?? null,
    managed: (mt ?? []).map((t: { team: string }) => t.team).sort(),
  };
}

export async function submitIdeaToTeam(team: string, content: string): Promise<void> {
  const { error } = await db.rpc("submit_idea", { _team: team, _content: content });
  if (error) throw error;
}

export async function moderateIdea(input: {
  id: string;
  action: ModerationAction;
  reason?: string;
}): Promise<void> {
  const { error } = await db.rpc("moderate_idea", {
    _id: input.id,
    _action: input.action,
    _reason: input.reason ?? null,
  });
  if (error) throw error;
}

export async function fetchLikes(): Promise<{ idea_id: string; user_id: string }[]> {
  const { data, error } = await db.from("idea_likes").select("idea_id, user_id").limit(5000);
  if (error) throw error;
  return data ?? [];
}

export async function setLike(ideaId: string, userId: string, liked: boolean): Promise<void> {
  const { error } = liked
    ? await db.from("idea_likes").insert({ idea_id: ideaId })
    : await db.from("idea_likes").delete().eq("idea_id", ideaId).eq("user_id", userId);
  if (error) throw error;
}

export async function fetchComments(ideaId: string): Promise<IdeaComment[]> {
  const { data, error } = await db
    .from("idea_comments")
    .select("*")
    .eq("idea_id", ideaId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as IdeaComment[];
}

export async function addComment(ideaId: string, body: string): Promise<void> {
  const { error } = await db.from("idea_comments").insert({ idea_id: ideaId, body: body.trim() });
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await db.from("idea_comments").delete().eq("id", id);
  if (error) throw error;
}

/** Traduit les erreurs de la base en message lisible. */
export function ideaErrorMessage(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes("ideas_content_length")) return "L'idée doit faire entre 5 et 2 000 caractères.";
  if (msg.includes("idea_comments_body_length"))
    return "Le commentaire doit faire entre 1 et 1 000 caractères.";
  if (msg.includes("row-level security")) return "Action non autorisée pour ton profil.";
  return msg;
}

/** Le compte peut-il modérer cette idée ? (admin : tout ; manager : ses équipes) */
export function canModerate(role: string, managed: string[], idea: Idea): boolean {
  if (role === "admin") return true;
  return role === "manager" && managed.some((t) => t.toLowerCase() === idea.team.toLowerCase());
}

/** Actions proposées pour une idée, selon son statut (déjà filtrées par canModerate). */
export function availableActions(role: string, idea: Idea): ModerationAction[] {
  if (role === "admin") {
    const all: Record<IdeaStatus, ModerationAction[]> = {
      "en attente": ["valider", "debat", "remonter", "supprimer"],
      "en débat": ["valider", "supprimer", "remonter"],
      remontée: ["valider", "supprimer"],
      validée: ["debat", "supprimer"],
      supprimée: ["valider", "debat"],
    };
    return all[idea.status];
  }
  if (idea.status === "en attente") return ["valider", "debat", "remonter", "supprimer"];
  if (idea.status === "en débat") return ["valider", "supprimer"];
  return [];
}
