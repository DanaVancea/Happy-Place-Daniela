import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Les tables d'actions et d'historique ne sont pas encore dans les types générés : client non typé.
const db = supabase as unknown as SupabaseClient;

/** Criticité : 4 niveaux. Jamais la couleur seule : libellé, rang et icône l'accompagnent. */
export const SEVERITIES = ["critique", "élevée", "moyenne", "faible"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_META: Record<
  Severity,
  { rank: number; label: string; icon: string; badge: string }
> = {
  critique: {
    rank: 1,
    label: "Critique",
    icon: "error",
    badge: "bg-error-container text-on-error-container border-error",
  },
  élevée: {
    rank: 2,
    label: "Élevée",
    icon: "warning",
    badge: "bg-tertiary-fixed text-on-tertiary-fixed border-on-tertiary-fixed",
  },
  moyenne: {
    rank: 3,
    label: "Moyenne",
    icon: "remove_circle",
    badge: "bg-secondary-fixed text-on-secondary border-secondary",
  },
  faible: {
    rank: 4,
    label: "Faible",
    icon: "arrow_circle_down",
    badge: "bg-surface-container-highest text-on-surface-variant border-outline",
  },
};

export function severityMeta(s: string) {
  return SEVERITY_META[s as Severity] ?? SEVERITY_META.moyenne;
}

export const ACTION_STATUSES = ["prévue", "en cours", "faite"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export type BlockerAction = {
  id: string;
  blocker_id: string;
  title: string;
  status: ActionStatus;
  due_date: string;
  owner_email: string;
  owner_name: string;
  created_at: string;
};

export type BlockerHistoryRow = {
  id: string;
  blocker_id: string;
  changed_at: string;
  changed_by_name: string;
  summary: string;
};

export type AssignableUser = { email: string; name: string; team: string | null };

export async function fetchBlockerActions(): Promise<BlockerAction[]> {
  const { data, error } = await db
    .from("blocker_actions")
    .select("*")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BlockerAction[];
}

export async function createBlockerAction(input: {
  blocker_id: string;
  title: string;
  owner_email: string;
  owner_name: string;
  due_date: string;
  status: ActionStatus;
}) {
  const { error } = await db.from("blocker_actions").insert(input);
  if (error) throw error;
}

export async function updateBlockerActionStatus(input: { id: string; status: ActionStatus }) {
  const { error } = await db
    .from("blocker_actions")
    .update({ status: input.status })
    .eq("id", input.id);
  if (error) throw error;
}

export async function deleteBlockerAction(id: string) {
  const { error } = await db.from("blocker_actions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data, error } = await db.rpc("blocker_assignable_users");
  if (error) throw error;
  return (data ?? []) as AssignableUser[];
}

export async function fetchBlockerHistory(blockerId: string): Promise<BlockerHistoryRow[]> {
  const { data, error } = await db
    .from("blocker_history")
    .select("*")
    .eq("blocker_id", blockerId)
    .order("changed_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as BlockerHistoryRow[];
}

export async function updateBlockerSettings(input: {
  id: string;
  severity?: Severity;
  sensitive_team?: string | null;
}) {
  const { id, ...patch } = input;
  const { error } = await db
    .from("blockers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Peut modifier ce point : admin, ou manager de l'équipe concernée (la base fait foi). */
export function canEditBlocker(
  ctx: { role: string | null | undefined; managed: string[] },
  department: string,
) {
  if (ctx.role === "admin") return true;
  return (
    ctx.role === "manager" &&
    ctx.managed.some((t) => t.trim().toLowerCase() === department.trim().toLowerCase())
  );
}

/** Archive à la main un point résolu (manager de l'équipe ou admin). */
export async function archiveBlocker(id: string) {
  const { error } = await db
    .from("blockers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
