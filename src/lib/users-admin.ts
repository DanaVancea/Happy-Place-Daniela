import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadBrowserLib } from "@/lib/browser-lib";

// Les nouvelles tables et fonctions ne sont pas encore dans les types générés : client non typé.
const db = supabase as unknown as SupabaseClient;

export type AppRole = "admin" | "manager" | "collaborateur";

export type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  team: string | null;
  teams: string[];
  role: AppRole;
  departure_date: string | null;
  created_at: string;
};

export type DepartureRequest = {
  id: string;
  user_id: string;
  user_label: string;
  team: string | null;
  requested_by_name: string;
  departure_date: string;
  comment: string | null;
  status: "en attente" | "validée" | "refusée";
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  created_at: string;
  actor_name: string;
  action: string;
  target: string | null;
  details: string | null;
};

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  collaborateur: "Collaborateur",
};

export const userLabel = (u: Pick<UserRow, "first_name" | "last_name" | "email">) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;

export const frDay = (ymd: string) => ymd.split("-").reverse().join("/");

export function todayYmd(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Départ à venir cette semaine (aujourd'hui inclus, 7 jours) ou déjà dépassé sans suppression. */
export function departureState(ymd: string | null): "none" | "week" | "later" | "overdue" {
  if (!ymd) return "none";
  if (ymd < todayYmd()) return "overdue";
  if (ymd <= todayYmd(7)) return "week";
  return "later";
}

export async function fetchUsers(): Promise<UserRow[]> {
  const { data, error } = await db
    .from("allowed_users")
    .select(
      "id, email, first_name, last_name, team, departure_date, created_at, allowed_user_roles(role), manager_teams(team)",
    )
    .order("created_at");
  if (error) throw error;
  type Raw = Omit<UserRow, "role" | "teams"> & {
    allowed_user_roles: { role: AppRole } | null;
    manager_teams: { team: string }[];
  };
  return ((data ?? []) as unknown as Raw[]).map((u) => ({
    id: u.id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    team: u.team,
    departure_date: u.departure_date,
    created_at: u.created_at,
    role: u.allowed_user_roles?.role ?? "collaborateur",
    teams: u.manager_teams.map((m) => m.team).sort(),
  }));
}

/** Nombre d'idées par équipe : une équipe qui a des idées ne peut pas être supprimée. */
export async function fetchIdeaCountsByTeam(): Promise<Record<string, number>> {
  const { data, error } = await db.from("ideas").select("team").limit(5000);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { team: string }[]) out[r.team] = (out[r.team] ?? 0) + 1;
  return out;
}

export async function fetchDepartureRequests(): Promise<DepartureRequest[]> {
  const { data, error } = await db
    .from("departure_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as DepartureRequest[];
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await db
    .from("admin_audit_log")
    .select("id, created_at, actor_name, action, target, details")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export async function decideDepartureRequest(id: string, accept: boolean) {
  const { error } = await db.rpc("traiter_demande_depart", { _id: id, _accept: accept });
  if (error) throw error;
}

export async function deleteUser(id: string) {
  const { error } = await db.rpc("supprimer_utilisateur", { _id: id });
  if (error) throw error;
}

/** Message lisible quand la migration n'a pas encore été appliquée. */
export function isMissingFeature(e: unknown): boolean {
  return /PGRST20[0-9]|42883|42P01|does not exist|Could not find/.test(JSON.stringify(e ?? ""));
}

/**
 * Envoie l'invitation par e-mail (lien de connexion) via la fonction Edge Supabase
 * « inviter-utilisateur ». Renvoie "envoyée", ou "indisponible" si la fonction n'est pas
 * déployée : le compte reste alors simplement préparé (mode test, aucun e-mail envoyé).
 */
export async function sendInvitation(email: string): Promise<"envoyée" | "indisponible"> {
  const { data, error } = await supabase.functions.invoke("inviter-utilisateur", {
    body: { email, redirectTo: window.location.origin },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 404 || /not found|Failed to send|FunctionsFetchError/i.test(error.message)) {
      return "indisponible";
    }
    throw new Error(error.message);
  }
  if ((data as { error?: string } | null)?.error)
    throw new Error((data as { error: string }).error);
  return "envoyée";
}

// --- Export RGPD ------------------------------------------------------------------

type ExportData = Record<string, unknown> & { profil: Record<string, unknown> };

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    "﻿" +
    [cols.join(";"), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(";"))].join("\r\n")
  );
}

/** Télécharge un ZIP (profil.json + un CSV par type de données) des données d'un collaborateur. */
export async function downloadUserExport(
  user: Pick<UserRow, "id" | "email" | "first_name" | "last_name">,
) {
  const { data, error } = await db.rpc("exporter_donnees_utilisateur", { _id: user.id });
  if (error) throw error;
  const d = data as ExportData;
  const JSZip = await loadBrowserLib<typeof import("jszip")>(
    "/vendor/jszip-3.10.2.min.js",
    "JSZip",
  );
  const zip = new JSZip();
  zip.file("profil.json", JSON.stringify(d.profil, null, 2));
  zip.file("export-complet.json", JSON.stringify(d, null, 2));
  for (const key of ["idees", "commentaires", "likes", "favoris", "articles_lus", "soumissions"]) {
    const rows = (d[key] as Record<string, unknown>[] | undefined) ?? [];
    zip.file(`${key}.csv`, toCsv(rows));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `données RGPD - ${userLabel(user)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// --- Signalement de départ par un manager -----------------------------------------

export type TeamMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  team: string;
  departure_date: string | null;
};

export async function fetchMyTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await db.rpc("mes_membres_equipe");
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

export async function reportDeparture(userId: string, date: string, comment: string) {
  const { error } = await db.rpc("signaler_depart", {
    _user_id: userId,
    _date: date,
    _comment: comment || null,
  });
  if (error) throw error;
}

// --- Bandeau admin -----------------------------------------------------------------

/** Compteurs du bandeau : départs cette semaine, départs dépassés non supprimés, demandes à traiter. */
export async function fetchDepartureBanner(): Promise<{
  week: number;
  overdue: number;
  requests: number;
}> {
  const { data, error } = await db
    .from("allowed_users")
    .select("departure_date")
    .not("departure_date", "is", null);
  if (error) throw error;
  let week = 0;
  let overdue = 0;
  for (const r of (data ?? []) as { departure_date: string }[]) {
    const s = departureState(r.departure_date);
    if (s === "week") week++;
    else if (s === "overdue") overdue++;
  }
  const { count } = await db
    .from("departure_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "en attente");
  return { week, overdue, requests: count ?? 0 };
}
