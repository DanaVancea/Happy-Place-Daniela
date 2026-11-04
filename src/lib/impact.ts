import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Les nouvelles tables et fonctions ne sont pas encore dans les types générés : client non typé.
const db = supabase as unknown as SupabaseClient;

export type TrackedPage = "actus" | "idees" | "points_bloquants" | "trombi";

export const PAGE_LABEL: Record<TrackedPage, string> = {
  actus: "Actualités",
  idees: "Boîte à idées",
  points_bloquants: "Points bloquants",
  trombi: "Trombi",
};

/** Page suivie correspondant à une URL (null = page non suivie). */
export function trackedPageOf(pathname: string): TrackedPage | null {
  if (pathname === "/" || pathname === "") return "actus";
  if (pathname.startsWith("/idees")) return "idees";
  if (pathname.startsWith("/points-bloquants")) return "points_bloquants";
  if (pathname.startsWith("/trombi")) return "trombi";
  return null;
}

/** Compte une page vue. Ne doit jamais gêner la navigation : les erreurs sont ignorées. */
export async function trackPageView(page: TrackedPage): Promise<void> {
  try {
    await db.rpc("track_page_view", { _page: page });
  } catch {
    /* suivi sans importance */
  }
}

export type Dated<T> = T & { start: string };

export type ImpactData = {
  total_users: number;
  teams_total: number;
  days: number;
  wau: number;
  wau_connected: number;
  mau_connected: number;
  mau: number;
  weekly: Dated<{ active: number; connected: number }>[];
  monthly: Dated<{ active: number; connected: number }>[];
  pages: { page: TrackedPage; views: number; visitors: number }[];
  pages_since: string | null;
  ideas_monthly: { month: string; team: string; count: number }[];
  team_participation: Dated<{ teams_with_ideas: number }>[];
  teams: string[];
  feedback: {
    responses: number;
    this_month: number;
    monthly: Dated<{ count: number }>[];
  };
};

export async function fetchImpact(days: number): Promise<ImpactData> {
  const { data, error } = await db.rpc("impact_dashboard", { _days: days });
  if (error) throw error;
  return data as ImpactData;
}

export async function submitFeedback(liked: string, improve: string): Promise<void> {
  const { error } = await db.rpc("submit_feedback", {
    _liked: liked,
    _improve: improve,
  });
  if (error) throw error;
}

export type FeedbackRow = {
  period: string;
  liked: string | null;
  improve: string | null;
  team: string | null;
};

export async function fetchFeedbackRows(): Promise<FeedbackRow[]> {
  const { data, error } = await db
    .from("feedback_responses")
    .select("period, liked, improve, team")
    .order("period", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeedbackRow[];
}

/** Cellule CSV : guillemets doublés, et préfixe contre l'injection de formules dans Excel. */
function csvCell(v: string | number | null): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function feedbackToCsv(rows: FeedbackRow[]): string {
  const head = ["Mois", "Ce que j'aime", "À améliorer", "Équipe"];
  const lines = rows.map((r) =>
    [r.period.slice(0, 7), r.liked, r.improve, r.team].map(csvCell).join(";"),
  );
  // BOM + séparateur « ; » : s'ouvre correctement dans Excel en français.
  return "﻿" + [head.map(csvCell).join(";"), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
export const monthLabel = (ymd: string) =>
  `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(2, 4)}`;
export const weekLabel = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
export const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
