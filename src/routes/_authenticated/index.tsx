import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { DepartureNotices } from "@/components/departure-notices";
import { Icon } from "@/components/icon";
import { MetricPanel, MetricTile } from "@/components/metric-panel";
import { NewsCard } from "@/components/news-feed";
import { NewsEditor } from "@/components/news-editor";
import { NewsReader } from "@/components/news-reader";
import {
  deleteDraftNews,
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
  const [editor, setEditor] = useState<{ news: News | null } | null>(null);

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

  const publish = useMutation({
    mutationFn: publishDraftNews,
    onSuccess: () => {
      toast.success("Actualité publiée");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (n: News) => deleteDraftNews(n.id, n.image_path),
    onSuccess: () => {
      toast.success("Actualité supprimée");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

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
  const adminRows = all
    .filter((n) => !isLive(n))
    .sort((a, b) => Number(isScheduled(a)) - Number(isScheduled(b)) || byDateDesc(a, b));
  const publishedRows = [...live].sort(byDateDesc).slice(0, 10);
  const more = (list: News[]) => list.slice(0, visible);

  const grid = (list: News[]) => (
    <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
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
      {email && <DepartureNotices email={email} />}

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
                className="rounded border border-primary px-xs py-0.5 text-[11px] font-label-sm text-primary hover:bg-surface-container"
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

      {/* Recherche et filtres */}
      <section aria-label="Recherche" className="space-y-xs">
        <div className="flex flex-col lg:flex-row gap-sm lg:items-end">
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
        <div className="flex flex-wrap items-center gap-md">
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

      {/* Indicateurs */}
      <section aria-labelledby="indicateurs-titre" className="space-y-sm">
        <div className="flex flex-wrap items-baseline gap-x-md gap-y-xs">
          <h2 id="indicateurs-titre" className="font-headline-sm text-headline-sm text-primary">
            Indicateurs
          </h2>
          {metrics.data && summary.atteint + summary.proche + summary.retard > 0 && (
            <>
              <p className="font-label-md text-label-md text-on-surface-variant" aria-live="polite">
                {(["atteint", "proche", "retard"] as MetricStatus[])
                  .filter((k) => summary[k] > 0)
                  .map((k) => `${summary[k]} ${STATUS_LABELS[k].toLowerCase()}`)
                  .join(" · ")}
              </p>
              <label className="flex items-center gap-xs font-label-sm text-label-sm">
                <input
                  type="checkbox"
                  checked={lateFirst}
                  onChange={(e) => setLateFirst(e.target.checked)}
                />
                En retard d'abord
              </label>
            </>
          )}
        </div>
        {metrics.isLoading && <div className="h-24 rounded bg-surface-container animate-pulse" />}
        {metrics.isError && (
          <p className="text-body-sm text-error">Les indicateurs sont indisponibles.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
          {sortedMetrics.map((m) => (
            <MetricTile key={m.key} metric={m} points={history.data?.[m.key]} onOpen={setMetric} />
          ))}
        </div>
      </section>

      {news.isLoading && <div className="h-40 rounded bg-surface-container animate-pulse" />}
      {news.isError && (
        <p className="text-body-sm text-error">Les actualités sont indisponibles.</p>
      )}

      {searching ? (
        <section aria-label="Résultats" className="space-y-sm">
          <h2 className="font-headline-sm text-headline-sm text-primary">Résultats</h2>
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
            <h2 id="une-titre" className="font-headline-sm text-headline-sm text-primary">
              À la une
            </h2>
            {news.data && featured.length === 0 && (
              <p className="text-body-sm text-on-surface-variant italic">
                Aucune actualité publiée.
                {isAdmin && " Utilise « Nouvelle actualité » pour en créer une."}
              </p>
            )}
            <div className="grid gap-md md:grid-cols-3">
              {featured.map((n, i) => (
                <div key={n.id} className={i === 0 ? "md:col-span-3" : ""}>
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

      {/* Espace admin */}
      {isAdmin && (
        <section
          aria-labelledby="admin-titre"
          className="space-y-sm border-t border-outline-variant pt-md"
        >
          <div className="flex items-center justify-between gap-sm">
            <h2 id="admin-titre" className="font-headline-sm text-headline-sm text-primary">
              Espace admin
            </h2>
            {!editor && (
              <button
                type="button"
                onClick={() => setEditor({ news: null })}
                className="flex items-center gap-xs rounded bg-primary px-md py-xs text-on-primary font-label-md text-label-md"
              >
                <Icon name="add" /> NOUVELLE ACTUALITÉ
              </button>
            )}
          </div>
          {editor && (
            <NewsEditor
              key={editor.news?.id ?? "new"}
              editing={editor.news}
              all={all}
              author={myName}
              email={myEmail}
              myDepartment={myDepartment}
              onDone={() => setEditor(null)}
            />
          )}
          <h3 className="font-headline-sm text-headline-sm text-primary pt-sm">
            Brouillons et actualités programmées ({adminRows.length})
          </h3>
          {adminRows.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Aucun brouillon ni publication programmée.
            </p>
          )}
          <div className="space-y-xs">
            {adminRows.map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded bg-surface-container p-sm"
              >
                <div className="min-w-0">
                  <p className="font-body-md font-bold text-primary wrap-anywhere">{n.title}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {isScheduled(n)
                      ? `Programmée le ${new Date(publishedAt(n)).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`
                      : "Brouillon"}{" "}
                    • Par {n.author}
                  </p>
                </div>
                <div className="flex items-center gap-sm shrink-0">
                  <button
                    type="button"
                    className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                    onClick={() => setEditor({ news: n })}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="font-label-sm text-label-sm text-error"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Supprimer « ${n.title} » ?`) && remove.mutate(n)}
                  >
                    Supprimer
                  </button>
                  {n.status === "brouillon" && (
                    <button
                      type="button"
                      disabled={publish.isPending}
                      className="rounded bg-primary px-sm py-1 text-on-primary font-label-sm text-label-sm disabled:opacity-50"
                      onClick={() =>
                        window.confirm(`Publier « ${n.title} » ? Elle sera visible par tous.`) &&
                        publish.mutate(n.id)
                      }
                    >
                      Publier
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <h3 className="font-headline-sm text-headline-sm text-primary pt-sm">
            Actualités publiées ({publishedRows.length} plus récentes)
          </h3>
          {publishedRows.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">Aucune actualité publiée.</p>
          )}
          <div className="space-y-xs">
            {publishedRows.map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded bg-surface-container p-sm"
              >
                <div className="min-w-0">
                  <p className="font-body-md font-bold text-primary wrap-anywhere">{n.title}</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {isScheduled(n)
                      ? `Programmée le ${new Date(publishedAt(n)).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`
                      : "Publiée"}{" "}
                    • Par {n.author}
                  </p>
                </div>
                <div className="flex items-center gap-sm shrink-0">
                  <button
                    type="button"
                    className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                    onClick={() => setEditor({ news: n })}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="font-label-sm text-label-sm text-error"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Supprimer « ${n.title} » ?`) && remove.mutate(n)}
                  >
                    Supprimer
                  </button>
                  {n.status === "brouillon" && (
                    <button
                      type="button"
                      disabled={publish.isPending}
                      className="rounded bg-primary px-sm py-1 text-on-primary font-label-sm text-label-sm disabled:opacity-50"
                      onClick={() =>
                        window.confirm(`Publier « ${n.title} » ? Elle sera visible par tous.`) &&
                        publish.mutate(n.id)
                      }
                    >
                      Publier
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <MetricPanel metric={metric} isAdmin={isAdmin} onClose={() => setMetric(null)} />
      <NewsReader
        news={reading}
        list={readerList}
        marks={marks}
        onSelect={setReading}
        onClose={() => setReading(null)}
      />
    </AppShell>
  );
}
