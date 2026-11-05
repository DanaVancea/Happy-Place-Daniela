import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FeedbackButton } from "@/components/feedback-button";
import { DepartureNotices } from "@/components/departure-notices";
import { Icon } from "@/components/icon";
import { MetricDelete, MetricForm } from "@/components/metric-form";
import { MetricPanel, MetricTile, STATUS_STYLE } from "@/components/metric-panel";
import { NewsCard } from "@/components/news-feed";
import { NewsEditor } from "@/components/news-editor";
import { NewsReader } from "@/components/news-reader";
import {
  deleteDraftNews,
  setNewsArchived,
  processAttachmentDeletionQueue,
  fetchMetrics,
  fetchNews,
  publishDraftNews,
  STATUS_LABELS,
  targetProgress,
  type Metric,
  type MetricStatus,
  type News,
} from "@/lib/dashboard";
import {
  DEPARTMENTS,
  LEVELS,
  LEVEL_LABELS,
  MIN_QUERY,
  PERIODS,
  filterNews,
  isLive,
  isScheduled,
  isSearching,
  noFilters,
  publishedAt,
  splitFeatured,
  byDateDesc,
  fetchAllMetricHistory,
  levelOf,
  type Filters,
} from "@/lib/news-feed";
import { useNewsMarks } from "@/lib/use-news-marks";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Happy Place — Actualités et indicateurs" },
      {
        name: "description",
        content:
          "Les actualités du cabinet et les indicateurs clés, sur une même page pour une vue rapide.",
      },
      { property: "og:title", content: "Happy Place — Actualités et indicateurs" },
      {
        property: "og:description",
        content: "Suivez les actualités du cabinet et ses indicateurs clés.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsPage,
});

const PAGE_SIZE = 9;
const select =
  "rounded border border-outline-variant bg-card p-xs font-body-md focus:border-primary focus:outline-none";

function NewsPage() {
  const qc = useQueryClient();
  const { role, email, user } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const myEmail = (email ?? "").toLowerCase();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const myName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    myEmail;

  const myDepartment = (DEPARTMENTS as readonly string[]).includes(String(meta.department))
    ? String(meta.department)
    : "";
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [reading, setReading] = useState<News | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const [metricForm, setMetricForm] = useState<{ metric: Metric | null } | null>(null);
  const [metricToDelete, setMetricToDelete] = useState<Metric | null>(null);
  // Suppression silencieuse des pièces jointes échues, une fois par chargement de l'accueil (Admin).
  useEffect(() => {
    if (!isAdmin) return;
    processAttachmentDeletionQueue()
      .then((r) => {
        if (r.remaining > 0) toast.error(`${r.remaining} document(s) n'ont pas pu être supprimés.`);
        else if (r.deleted > 0) toast.success(`${r.deleted} document(s) supprimé(s)`);
      })
      .catch(() => toast.error("La suppression des documents échus a échoué."))
      .finally(() => qc.invalidateQueries({ queryKey: ["attachment_deletion_queue"] }));
  }, [isAdmin, qc]);
  const news = useQuery({ queryKey: ["news"], queryFn: fetchNews, retry: false });
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics, retry: false });
  const history = useQuery({
    queryKey: ["metrics-history-all"],
    queryFn: fetchAllMetricHistory,
    retry: false,
  });
  const marks = useNewsMarks(isAdmin);
  const [lateFirst, setLateFirst] = useState(false);
  const onError = (e: unknown) => toast.error((e as Error).message);

  const all = useMemo(() => news.data ?? [], [news.data]);
  const live = useMemo(() => all.filter(isLive), [all]);
  const unreadCount = live.filter((n) => !marks.reads.has(n.id)).length;
  // Actualités urgentes pas encore lues : affichées en bandeau tout en haut
  const urgent = useMemo(
    () => live.filter((n) => levelOf(n) === "urgent" && !marks.reads.has(n.id)).sort(byDateDesc),
    [live, marks.reads],
  );

  // Synthèse et tri des indicateurs selon leur statut par rapport à la cible
  const statusOf = (m: Metric): MetricStatus | null => targetProgress(m)?.status ?? null;
  const summary = useMemo(() => {
    const c: Record<MetricStatus, number> = { atteint: 0, proche: 0, retard: 0 };
    for (const m of metrics.data ?? []) {
      const st = targetProgress(m)?.status;
      if (st) c[st] += 1;
    }
    return c;
  }, [metrics.data]);
  const sortedMetrics = useMemo(() => {
    const list = [...(metrics.data ?? [])];
    if (!lateFirst) return list;
    const rank = { retard: 0, proche: 1, atteint: 2 } as const;
    return list.sort(
      (a, b) => (statusOf(a) ? rank[statusOf(a)!] : 3) - (statusOf(b) ? rank[statusOf(b)!] : 3),
    );
  }, [metrics.data, lateFirst]);
  const searching = isSearching(filters);
  const results = useMemo(
    () => filterNews(live, filters, marks.favs, marks.reads).sort(byDateDesc),
    [live, filters, marks.favs, marks.reads],
  );
  const { featured, rest } = useMemo(() => splitFeatured(live), [live]);
  const readerList = searching ? results : [...featured, ...rest];
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setVisible(PAGE_SIZE);
  };
  const query = filters.query;
  const draftCount = all.filter((n) => !isLive(n) && !n.archived_at).length;
  const more = (list: News[]) => list.slice(0, visible);

  const grid = (list: News[]) => (
    <div className="grid gap-sm sm:grid-cols-2 xl:grid-cols-3">
      {more(list).map((n) => (
        <NewsCard key={n.id} news={n} marks={marks} query={query} onOpen={setReading} />
      ))}
    </div>
  );
  const moreButton = (list: News[]) =>
    list.length > visible && (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="rounded border border-primary px-md py-xs text-primary font-label-md text-label-md hover:bg-surface-container"
        >
          Voir plus ({list.length - visible})
        </button>
      </div>
    );

  return (
    <AppShell role={role} email={email} eyebrow="Vue d'ensemble" title="Actualités et indicateurs">
      {email && (role === "admin" || role === "manager") && (
        <DepartureNotices email={email} role={role} />
      )}

      {/* Actualités urgentes non lues */}
      {urgent.length > 0 && (
        <section
          aria-label="Actualités urgentes"
          className="space-y-xs rounded border border-error bg-error-container p-sm"
        >
          {urgent.slice(0, 3).map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-sm">
              <span className="font-label-md text-label-md uppercase text-error">Urgent</span>
              <button
                type="button"
                onClick={() => setReading(n)}
                aria-haspopup="dialog"
                className="flex-1 min-w-0 text-left font-body-md font-bold text-primary underline-offset-2 hover:underline wrap-anywhere"
              >
                {n.title}
              </button>
              <button
                type="button"
                onClick={() => marks.toggleRead(n.id)}
                className="rounded border border-primary px-xs py-0.5 text-xs font-label-sm text-primary hover:bg-surface-container"
              >
                Marquer comme lu
              </button>
            </div>
          ))}
          {urgent.length > 3 && (
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              + {urgent.length - 3} autre{urgent.length - 3 > 1 ? "s" : ""} actualité
              {urgent.length - 3 > 1 ? "s" : ""} urgente{urgent.length - 3 > 1 ? "s" : ""} dans le
              fil
            </p>
          )}
        </section>
      )}

      <div className="grid gap-x-md gap-y-sm md:grid-cols-[minmax(0,1fr)_minmax(20rem,30%)] md:items-start">
        <div className="contents">
          <section aria-label="Recherche" className="contents">
            <div className="flex min-w-0 flex-col lg:flex-row gap-sm lg:items-end md:col-start-1 md:row-start-1 md:self-end">
              <div className="flex-1 space-y-xs">
                <label
                  htmlFor="news-search"
                  className="font-label-md text-label-md text-on-surface-variant block"
                >
                  RECHERCHER
                </label>
                <input
                  id="news-search"
                  type="search"
                  value={filters.query}
                  onChange={(e) => set({ query: e.target.value })}
                  placeholder="Titre, chapô ou contenu…"
                  className={`${select} w-full`}
                />
              </div>
              <select
                aria-label="Département"
                className={select}
                value={filters.department}
                onChange={(e) => set({ department: e.target.value })}
              >
                <option value="">Tous les départements</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <select
                aria-label="Importance"
                className={select}
                value={filters.level}
                onChange={(e) => set({ level: e.target.value })}
              >
                <option value="">Toute importance</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Période"
                className={select}
                value={filters.period}
                onChange={(e) => set({ period: e.target.value })}
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-md md:col-start-1 md:row-start-2">
              <label className="flex items-center gap-xs font-body-sm">
                <input
                  type="checkbox"
                  checked={filters.favorites}
                  onChange={(e) => set({ favorites: e.target.checked })}
                />
                Mes favoris
              </label>
              <label className="flex items-center gap-xs font-body-sm">
                <input
                  type="checkbox"
                  checked={filters.unread}
                  onChange={(e) => set({ unread: e.target.checked })}
                />
                Non lues{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </label>
              {filters.query.trim().length > 0 && filters.query.trim().length < MIN_QUERY && (
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Saisis au moins {MIN_QUERY} caractères pour lancer la recherche.
                </span>
              )}
              {searching && (
                <>
                  <span
                    className="font-label-sm text-label-sm text-on-surface-variant"
                    aria-live="polite"
                  >
                    {results.length} résultat{results.length > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => set(noFilters)}
                    className="font-label-sm text-label-sm text-primary underline"
                  >
                    Effacer les filtres
                  </button>
                </>
              )}
            </div>
          </section>
          <h2
            id={searching ? "resultats-titre" : "une-titre"}
            className="font-headline-lg text-headline-lg font-bold text-primary max-md:order-1 md:col-start-1 md:row-start-3 md:self-start"
          >
            {searching ? "Résultats" : "À la une"}
          </h2>
        </div>
        {/* Haut de la colonne de droite : bouton « Nouvelle actualité », titre et résumé */}
        <div className="contents">
          {isAdmin && (
            <div className="flex w-full flex-wrap gap-xs md:col-start-2 md:row-start-1 md:min-h-[3rem] md:self-end">
              <Link
                to="/gerer-actualites"
                search={{ nouvelle: true }}
                className="flex flex-1 items-center justify-center gap-xs rounded bg-primary px-md py-xs text-on-primary font-label-md text-label-md"
              >
                <Icon name="add" /> NOUVELLE ACTUALITÉ
              </Link>
              <Link
                to="/gerer-actualites"
                className="flex flex-1 items-center justify-center gap-xs rounded border border-primary px-md py-xs text-primary font-label-md text-label-md hover:bg-surface-container"
              >
                <Icon name="edit_note" /> GÉRER LES ACTUALITÉS
                {draftCount > 0 && (
                  <span
                    className="rounded bg-secondary-fixed px-xs font-label-sm text-label-sm text-on-secondary"
                    aria-label={`${draftCount} brouillon${draftCount > 1 ? "s" : ""} ou programmée${draftCount > 1 ? "s" : ""}`}
                  >
                    {draftCount}
                  </span>
                )}
              </Link>
            </div>
          )}
          <div className="space-y-xs md:col-start-2 md:row-start-3">
            <div className="flex items-center justify-between gap-sm">
              <h2
                id="indicateurs-titre"
                className="font-headline-lg text-headline-lg font-bold text-primary"
              >
                Indicateurs
              </h2>
              {metrics.data && summary.atteint + summary.proche + summary.retard > 0 && (
                <label className="flex items-center gap-xs font-label-sm text-label-sm">
                  <input
                    type="checkbox"
                    checked={lateFirst}
                    onChange={(e) => setLateFirst(e.target.checked)}
                  />
                  À améliorer d'abord
                </label>
              )}
            </div>
            {metrics.data && summary.atteint + summary.proche + summary.retard > 0 && (
              <p className="flex flex-wrap gap-xs" aria-live="polite">
                {(["atteint", "proche", "retard"] as MetricStatus[])
                  .filter((k) => summary[k] > 0)
                  .map((k) => (
                    <span
                      key={k}
                      className={`rounded px-xs py-0.5 text-xs font-label-sm ${STATUS_STYLE[k]}`}
                    >
                      {summary[k]} {STATUS_LABELS[k].toLowerCase()}
                    </span>
                  ))}
              </p>
            )}
          </div>
        </div>

        {/* Colonne de droite : tuiles, alignées sur « À la une » */}
        <aside
          aria-labelledby="indicateurs-titre"
          className="space-y-sm md:col-start-2 md:row-start-4 md:sticky md:top-sm md:self-start"
        >
          {/* Indicateurs */}
          <section aria-labelledby="indicateurs-titre" className="space-y-sm">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setMetricForm({ metric: null })}
                className="flex items-center gap-xs rounded border border-primary px-md py-xs font-label-md text-label-md text-primary hover:bg-surface-container"
              >
                <Icon name="add" /> NOUVEL INDICATEUR
              </button>
            )}
            {metrics.isLoading && (
              <div className="h-24 rounded bg-surface-container animate-pulse" />
            )}
            {metrics.isError && (
              <p className="text-body-sm text-error">Les indicateurs sont indisponibles.</p>
            )}
            <div
              role="region"
              aria-label="Liste des indicateurs : fais défiler pour voir les suivants"
              tabIndex={0}
              className="max-h-[27rem] snap-y snap-proximity overflow-y-auto pr-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="grid grid-cols-2 gap-sm">
                {sortedMetrics.map((m) => (
                  <div key={m.key} className="flex snap-start">
                    <MetricTile metric={m} points={history.data?.[m.key]} onOpen={setMetric} />
                  </div>
                ))}
              </div>
            </div>
            {sortedMetrics.length > 4 && (
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                4 sur {sortedMetrics.length} affichés : fais défiler pour voir les autres.
              </p>
            )}
          </section>
        </aside>

        <div className="min-w-0 space-y-md max-md:order-1 md:col-start-1 md:row-start-4">
          {news.isLoading && <div className="h-40 rounded bg-surface-container animate-pulse" />}
          {news.isError && (
            <p className="text-body-sm text-error">Les actualités sont indisponibles.</p>
          )}

          {searching ? (
            <section aria-labelledby="resultats-titre" className="space-y-sm">
              {news.data && results.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucune actualité ne correspond à ta recherche.
                </p>
              )}
              {grid(results)}
              {moreButton(results)}
            </section>
          ) : (
            <>
              <section aria-labelledby="une-titre" className="space-y-sm">
                {news.data && featured.length === 0 && (
                  <p className="text-body-sm text-on-surface-variant italic">
                    Aucune actualité publiée.
                    {isAdmin && " Utilise « Nouvelle actualité » pour en créer une."}
                  </p>
                )}
                <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
                  {featured.map((n, i) => (
                    <div key={n.id} className={i === 0 ? "col-span-full" : "flex *:w-full"}>
                      <NewsCard
                        news={n}
                        marks={marks}
                        query=""
                        hero
                        lead={i === 0}
                        onOpen={setReading}
                      />
                    </div>
                  ))}
                </div>
              </section>
              {rest.length > 0 && (
                <section aria-labelledby="fil-titre" className="space-y-sm">
                  <h2 id="fil-titre" className="font-headline-sm text-headline-sm text-primary">
                    Toutes les actualités
                  </h2>
                  {grid(rest)}
                  {moreButton(rest)}
                </section>
              )}
            </>
          )}

          <MetricPanel
            metric={metric}
            isAdmin={isAdmin}
            onClose={() => setMetric(null)}
            onEdit={
              isAdmin
                ? (m) => {
                    setMetric(null);
                    setMetricForm({ metric: m });
                  }
                : undefined
            }
            onDelete={
              isAdmin
                ? (m) => {
                    setMetric(null);
                    setMetricToDelete(m);
                  }
                : undefined
            }
          />
          {metricForm && (
            <MetricForm metric={metricForm.metric} onClose={() => setMetricForm(null)} />
          )}
          {metricToDelete && (
            <MetricDelete metric={metricToDelete} onClose={() => setMetricToDelete(null)} />
          )}
          <NewsReader
            news={reading}
            list={readerList}
            marks={marks}
            onSelect={setReading}
            onClose={() => setReading(null)}
          />
        </div>
      </div>
      <FeedbackButton />
    </AppShell>
  );
}
