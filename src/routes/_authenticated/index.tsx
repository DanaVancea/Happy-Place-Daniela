import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { NewsReader } from "@/components/news-reader";
import { DepartureNotices } from "@/components/departure-notices";
import { NewsImage, NewsLinks, NewsMediaEditor } from "@/components/news-media";
import {
  emptyMedia,
  linkErrors,
  mediaFromNews,
  toNewsLinks,
  type MediaDraft,
} from "@/lib/news-media";
import {
  fetchMetrics,
  deltaText,
  fetchNews,
  type News,
  saveDraftNews,
  publishDraftNews,
  deleteDraftNews,
  timeAgo,
  updateMetric,
  TREND_LABELS,
  type Metric,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Happy Place — Actualités et indicateurs" },
      {
        name: "description",
        content:
          "Les actualités du cabinet et les indicateurs clés, sur une même page pour une vue rapide.",
      },
      { property: "og:title", content: "Happy Place — Actualités" },
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

function metricLabel(metric: Metric) {
  if (metric.key === "training_kpi") return "Taux de placement";
  if (metric.key === "active_users") return "Missions actives";
  return metric.label;
}

function formatMetric(m: Metric) {
  const v = Number(m.value);
  const formatted = m.unit === "%" ? v.toFixed(1) : v.toLocaleString("fr-FR");
  return `${formatted}${m.unit ?? ""}`;
}

function NewsPage() {
  const qc = useQueryClient();
  const { role, email, user } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const canWriteNews = role === "admin" || role === "manager";
  const myEmail = (email ?? "").toLowerCase();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const myName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    myEmail;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaDraft>(emptyMedia);
  const [showLinkErrs, setShowLinkErrs] = useState(false);
  const newsLinkErrs = showLinkErrs ? linkErrors(media.links) : {};
  const [nps, setNps] = useState<string>("");
  const [readingNews, setReadingNews] = useState<News | null>(null);

  const news = useQuery({ queryKey: ["news"], queryFn: fetchNews, retry: false });
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics, retry: false });
  const onError = (e: unknown) => toast.error((e as Error).message);

  const saveDraft = useMutation({
    mutationFn: saveDraftNews,
    onSuccess: () => {
      setTitle("");
      setBody("");
      setEditingNewsId(null);
      setMedia(emptyMedia());
      setShowLinkErrs(false);
      toast.success("Brouillon enregistré");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

  const publishDraft = useMutation({
    mutationFn: publishDraftNews,
    onSuccess: () => {
      toast.success("Actualité publiée");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

  const removeDraft = useMutation({
    mutationFn: (n: { id: string; image_path?: string | null }) =>
      deleteDraftNews(n.id, n.image_path),
    onSuccess: () => {
      toast.success("Brouillon supprimé");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

  const saveMetric = useMutation({
    mutationFn: updateMetric,
    onSuccess: () => {
      toast.success("KPI mis à jour");
      qc.invalidateQueries({ queryKey: ["metrics"] });
    },
    onError,
  });

  const visibleDrafts = news.data?.filter((n) => n.status === "brouillon") ?? [];
  const drafts = visibleDrafts.length;
  const published = news.data?.filter((n) => n.status === "publiée") ?? [];
  const npsMetric = metrics.data?.find((m) => m.key === "nps");

  return (
    <AppShell role={role} email={email} eyebrow="Vue d'ensemble" title="Actualités">
      {email && <DepartureNotices email={email} />}
      <div className="bento-grid">
        {/* Actualités */}
        <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex flex-col gap-md">
          <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
            <h2 className="font-headline-sm text-headline-sm text-primary">
              Actualités du cabinet
            </h2>
            {canWriteNews && (
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {drafts} brouillon{drafts > 1 ? "s" : ""} en attente
              </span>
            )}
          </div>
          {canWriteNews && (
            <form
              className="space-y-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim()) return;
                setShowLinkErrs(true);
                if (Object.keys(linkErrors(media.links)).length) {
                  toast.error("Corrige les liens invalides avant d'enregistrer.");
                  return;
                }
                saveDraft.mutate({
                  links: toNewsLinks(media.links),
                  media,
                  id: editingNewsId ?? undefined,
                  title: title.trim(),
                  body,
                  author: myName,
                  author_email: myEmail,
                });
              }}
            >
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant block">
                  TITRE
                </label>
                <input
                  className="w-full bg-transparent border-b border-outline-variant focus:border-primary focus:outline-none transition-colors font-headline-sm text-headline-sm px-0 py-xs"
                  placeholder="Saisis un titre…"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant block">
                  CONTENU
                </label>
                <textarea
                  className="w-full bg-card border border-outline-variant rounded focus:border-primary focus:outline-none p-sm font-body-md"
                  placeholder="Rédige l'actualité…"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-sm">
                <NewsMediaEditor
                  value={media}
                  onChange={setMedia}
                  linkErrs={newsLinkErrs}
                  disabled={saveDraft.isPending}
                  title={title}
                />
                <div className="flex items-center gap-sm">
                  {editingNewsId && (
                    <button
                      type="button"
                      className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                      onClick={() => {
                        setEditingNewsId(null);
                        setTitle("");
                        setBody("");
                        setMedia(emptyMedia());
                        setShowLinkErrs(false);
                      }}
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saveDraft.isPending}
                    className="rounded px-lg py-xs bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50"
                  >
                    {saveDraft.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
                  </button>
                </div>
              </div>
            </form>
          )}
          <div className="mt-md pt-md border-t border-outline-variant">
            {canWriteNews && visibleDrafts.length > 0 && (
              <>
                <h3 className="font-label-md text-label-md text-on-surface-variant mb-sm">
                  BROUILLONS
                </h3>
                <div className="space-y-xs mb-md">
                  {visibleDrafts.map((n) => {
                    const own = (n.author_email ?? "").toLowerCase() === myEmail;
                    const allowed = isAdmin || own;
                    return (
                      <div
                        key={n.id}
                        className="flex items-center justify-between gap-sm p-sm bg-surface-container rounded"
                      >
                        <div className="flex items-center gap-md min-w-0">
                          <Icon name="draft" className="text-on-surface-variant" />
                          <div className="min-w-0">
                            <p className="font-body-md text-primary flex items-center gap-xs">
                              <span className="truncate">{n.title}</span>
                              <span className="shrink-0 border border-outline-variant rounded px-xs font-label-sm text-label-sm text-on-surface-variant">
                                Brouillon
                              </span>
                            </p>
                            <p className="text-xs text-on-surface-variant uppercase font-label-sm">
                              Créé {timeAgo(n.created_at)} • Par {n.author}
                            </p>
                          </div>
                        </div>
                        {allowed && (
                          <div className="flex items-center gap-sm shrink-0">
                            <button
                              type="button"
                              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                              onClick={() => {
                                setEditingNewsId(n.id);
                                setTitle(n.title);
                                setBody(n.body ?? "");
                                setMedia(mediaFromNews(n));
                                setShowLinkErrs(false);
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="font-label-sm text-label-sm text-error"
                              disabled={removeDraft.isPending}
                              onClick={() => {
                                if (window.confirm(`Supprimer le brouillon « ${n.title} » ?`))
                                  removeDraft.mutate(n);
                              }}
                            >
                              Supprimer
                            </button>
                            <button
                              type="button"
                              className="rounded px-sm py-1 bg-primary text-on-primary font-label-sm text-label-sm disabled:opacity-50"
                              disabled={publishDraft.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Publier l'actualité « ${n.title} » ? Elle sera visible par tous.`,
                                  )
                                )
                                  publishDraft.mutate(n.id);
                              }}
                            >
                              Publier
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <h3 className="font-label-md text-label-md text-on-surface-variant mb-sm">
              PUBLIÉES RÉCEMMENT
            </h3>
            <div className="space-y-xs">
              {news.isLoading && (
                <p className="text-body-sm text-on-surface-variant">Chargement…</p>
              )}
              {news.isError && (
                <p className="text-body-sm text-error">Les actualités sont indisponibles.</p>
              )}
              {published.slice(0, 6).map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => setReadingNews(n)}
                  aria-haspopup="dialog"
                  className="w-full text-left p-sm bg-surface-container rounded hover:bg-surface-container-high transition-colors cursor-pointer group min-w-0 overflow-hidden space-y-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {n.image_path && <NewsImage path={n.image_path} alt={n.title} />}
                  <div className="flex items-center justify-between gap-sm min-w-0">
                    <div className="flex items-center gap-md min-w-0">
                      <Icon name="article" className="text-on-surface-variant" />
                      <div className="min-w-0">
                        <p className="font-body-md text-primary group-hover:underline wrap-anywhere">
                          {n.title}
                        </p>
                        <p className="text-xs text-on-surface-variant uppercase font-label-sm">
                          Publiée {timeAgo(n.created_at)} • Par {n.author}
                        </p>
                      </div>
                    </div>
                    {isAdmin && <Icon name="edit" className="text-on-surface-variant" />}
                  </div>
                  <NewsLinks links={n.links} />
                </button>
              ))}
              {news.data && published.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucune actualité publiée.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Indicateurs : vue rapide sur la même page */}
        <section
          aria-labelledby="indicateurs-titre"
          className="col-span-12 lg:col-span-4 min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex flex-col gap-md"
        >
          <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
            <h2 id="indicateurs-titre" className="font-headline-sm text-headline-sm text-primary">
              Indicateurs
            </h2>
          </div>
          {metrics.isError && (
            <p className="text-body-sm text-error">Les indicateurs sont indisponibles.</p>
          )}
          <div className="grid grid-cols-2 gap-sm">
            {metrics.data?.map((m) => (
              <div
                key={m.key}
                className="p-sm bg-card border border-outline-variant rounded min-w-0"
              >
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase wrap-anywhere">
                  {metricLabel(m)}
                </p>
                <p className="font-display text-[28px] leading-tight text-primary">
                  {formatMetric(m)}
                </p>
                <p className="text-[11px] text-on-surface-variant font-label-sm">
                  {TREND_LABELS[m.trend]}
                  {deltaText(m) && ` · ${deltaText(m)}`}
                </p>
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="space-y-xs">
              <label className="font-label-sm text-label-sm text-on-surface-variant block">
                MODIFIER LE NPS CANDIDATS
              </label>
              <div className="flex gap-xs">
                <input
                  className="flex-grow min-w-0 bg-card border border-outline-variant rounded p-xs font-label-md focus:outline-none focus:border-primary"
                  type="number"
                  value={nps !== "" ? nps : (npsMetric?.value ?? "")}
                  onChange={(e) => setNps(e.target.value)}
                />
                <button
                  onClick={() =>
                    saveMetric.mutate({
                      key: "nps",
                      value: Number(nps !== "" ? nps : (npsMetric?.value ?? 0)),
                    })
                  }
                  disabled={saveMetric.isPending}
                  className="rounded bg-primary text-on-primary px-sm font-label-md text-label-md disabled:opacity-50"
                >
                  METTRE À JOUR
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      <NewsReader news={readingNews} onClose={() => setReadingNews(null)} />
    </AppShell>
  );
}
