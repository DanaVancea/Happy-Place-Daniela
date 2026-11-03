import { db, type News } from "@/lib/dashboard";
import type { Json } from "@/integrations/supabase/types";
import { applyNewsImage, type MediaDraft, type NewsLink } from "@/lib/news-media";

export const LEVELS = ["information", "important", "urgent"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = {
  information: "Information",
  important: "Important",
  urgent: "Urgent",
};
export const DEPARTMENTS = ["RH", "DSI", "Office management"] as const;
export const MAX_PINNED = 4;
export const FEATURED_COUNT = 4;
const NEW_DAYS = 14;

export const PERIODS = [
  { value: "", label: "Toute période" },
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
] as const;

/** Minuscules sans accents, pour une recherche tolérante. */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const levelOf = (n: News): Level =>
  (LEVELS as readonly string[]).includes(n.level ?? "") ? (n.level as Level) : "information";

/** Date affichée : date de publication programmée si elle existe, sinon création. */
export const publishedAt = (n: News) => n.publish_at ?? n.created_at;
export const isScheduled = (n: News) =>
  n.status === "publiée" && !!n.publish_at && new Date(n.publish_at).getTime() > Date.now();
export const isLive = (n: News) => n.status === "publiée" && !isScheduled(n);
export const isFeaturedNow = (n: News) =>
  !!n.pinned && (!n.featured_until || new Date(n.featured_until).getTime() > Date.now());
export const isFresh = (n: News) =>
  Date.now() - new Date(publishedAt(n)).getTime() < NEW_DAYS * 864e5;

export const readingMinutes = (n: News) =>
  Math.max(1, Math.ceil(`${n.summary ?? ""} ${n.body ?? ""}`.trim().split(/\s+/).length / 200));

export const byDateDesc = (a: News, b: News) =>
  new Date(publishedAt(b)).getTime() - new Date(publishedAt(a)).getTime();

/** À la une : actus épinglées (4 max), complétées par les plus récentes. */
export function splitFeatured(live: News[]) {
  const sorted = [...live].sort(byDateDesc);
  const pinned = sorted.filter(isFeaturedNow).slice(0, FEATURED_COUNT);
  const ids = new Set(pinned.map((n) => n.id));
  const fill = sorted.filter((n) => !ids.has(n.id)).slice(0, FEATURED_COUNT - pinned.length);
  const featured = [...pinned, ...fill].sort(byDateDesc);
  const featuredIds = new Set(featured.map((n) => n.id));
  return { featured, rest: sorted.filter((n) => !featuredIds.has(n.id)) };
}

export type Filters = {
  query: string;
  department: string;
  level: string;
  period: string;
  favorites: boolean;
  unread: boolean;
};
export const noFilters: Filters = {
  query: "",
  department: "",
  level: "",
  period: "",
  favorites: false,
  unread: false,
};
export const MIN_QUERY = 3;
export const isSearching = (f: Filters) =>
  f.query.trim().length >= MIN_QUERY ||
  !!f.department ||
  !!f.level ||
  !!f.period ||
  f.favorites ||
  f.unread;

export function filterNews(list: News[], f: Filters, favs: Set<string>, reads: Set<string>) {
  const q = f.query.trim().length >= MIN_QUERY ? normalize(f.query.trim()) : "";
  const since = f.period ? Date.now() - Number(f.period) * 864e5 : 0;
  return list.filter(
    (n) =>
      (!q || normalize(`${n.title} ${n.summary ?? ""} ${n.body ?? ""}`).includes(q)) &&
      (!f.department || n.department === f.department) &&
      (!f.level || levelOf(n) === f.level) &&
      (!since || new Date(publishedAt(n)).getTime() >= since) &&
      (!f.favorites || favs.has(n.id)) &&
      (!f.unread || !reads.has(n.id)),
  );
}

/** Découpe un texte en segments, en marquant ceux qui correspondent (sans tenir compte des accents). */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim().length >= MIN_QUERY ? normalize(query.trim()) : "";
  if (!q) return [{ text, hit: false }];
  let flat = "";
  const map: number[] = [];
  Array.from(text).forEach((ch, i) => {
    const base = normalize(ch);
    for (const c of base) {
      flat += c;
      map.push(i);
    }
  });
  const chars = Array.from(text);
  const marks = new Array<boolean>(chars.length).fill(false);
  for (let from = flat.indexOf(q); from !== -1; from = flat.indexOf(q, from + q.length)) {
    for (let k = from; k < from + q.length; k++) marks[map[k]] = true;
  }
  const parts: { text: string; hit: boolean }[] = [];
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += ch;
    else parts.push({ text: ch, hit: marks[i] });
  });
  return parts;
}

/* ---------- Lecture / favoris ---------- */

async function ids(table: "news_favorites" | "news_reads"): Promise<string[]> {
  const { data, error } = await db.from(table).select("news_id");
  // Tables absentes (migration pas encore appliquée) : on affiche la page sans favoris.
  if (error) return [];
  return (data ?? []).map((r) => r.news_id);
}
export const fetchFavoriteIds = () => ids("news_favorites");
export const fetchReadIds = () => ids("news_reads");

export async function setMark(table: "news_favorites" | "news_reads", id: string, on: boolean) {
  const { error } = on
    ? await db.from(table).insert({ news_id: id })
    : await db.from(table).delete().eq("news_id", id);
  if (error && !(on && error.code === "23505")) throw error;
}

export async function fetchReadCounts(): Promise<Record<string, number>> {
  const { data, error } = await db.rpc("news_read_counts");
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.news_id, Number(r.reads)]));
}

/* ---------- Indicateurs : historique ---------- */

export type MetricPoint = { value: number; recorded_at: string; is_demo?: boolean };
export async function fetchMetricHistory(key: string): Promise<MetricPoint[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const { data, error } = await db
    .from("metrics_history")
    .select("value,recorded_at,is_demo")
    .eq("metric_key", key)
    .gte("recorded_at", since.toISOString())
    .order("recorded_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    value: Number(r.value),
    recorded_at: r.recorded_at,
    is_demo: r.is_demo,
  }));
}

/* ---------- Mots interdits ---------- */

const fold = (s: string) =>
  normalize(s).replace(/œ/g, "o").replace(/æ/g, "a").replace(/\s+/g, " ").trim();

export async function fetchBlockedWords(): Promise<string[]> {
  const { data, error } = await db.from("blocked_words").select("word");
  if (error) throw error;
  return (data ?? []).map((r) => r.word);
}

/** Premier mot interdit trouvé (mots entiers, sans accents ni majuscules), sinon null. */
export function findBlockedWord(text: string, words: string[]): string | null {
  const t = fold(text);
  for (const w of [...words].sort()) {
    const esc = fold(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${esc}(s|x)?([^a-z0-9]|$)`).test(t)) return w;
  }
  return null;
}

/** Relevés des 12 derniers mois de tous les indicateurs, regroupés par clé (pour les mini-courbes). */
export async function fetchAllMetricHistory(): Promise<Record<string, MetricPoint[]>> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const { data, error } = await db
    .from("metrics_history")
    .select("metric_key,value,recorded_at,is_demo")
    .gte("recorded_at", since.toISOString())
    .order("recorded_at");
  if (error) throw error;
  const out: Record<string, MetricPoint[]> = {};
  for (const r of data ?? []) {
    (out[r.metric_key] ??= []).push({
      value: Number(r.value),
      recorded_at: r.recorded_at,
      is_demo: r.is_demo,
    });
  }
  return out;
}

/* ---------- Édition (Admin) ---------- */

export type NewsEdit = {
  id?: string;
  title: string;
  summary: string;
  body: string;
  department: string;
  level: Level;
  pinned: boolean;
  publish_at: string | null;
  featured_until: string | null;
  author: string;
  author_email: string;
  links: NewsLink[];
  media: MediaDraft;
  idea_id?: string | null;
};

export async function saveNews(input: NewsEdit, status: "brouillon" | "publiée") {
  const payload = {
    title: input.title,
    summary: input.summary.trim() || null,
    body: input.body,
    department: input.department || null,
    level: input.level,
    pinned: input.pinned,
    publish_at: status === "publiée" ? input.publish_at : null,
    featured_until: input.featured_until,
    author: input.author,
    author_email: input.author_email.toLowerCase(),
    status,
    links: input.links as unknown as Json,
    idea_id: input.idea_id ?? null,
  };
  const { data, error } = input.id
    ? await db.from("news").update(payload).eq("id", input.id).select("id").single()
    : await db.from("news").insert(payload).select("id").single();
  if (error) throw error;
  await applyNewsImage(data.id, input.media);
}
