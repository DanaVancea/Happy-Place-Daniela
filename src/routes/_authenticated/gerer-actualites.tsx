import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { NewsEditor } from "@/components/news-editor";
import {
  deleteDraftNews,
  fetchNews,
  publishDraftNews,
  setNewsArchived,
  type News,
} from "@/lib/dashboard";
import { DEPARTMENTS, byDateDesc, isLive, isScheduled, publishedAt } from "@/lib/news-feed";

export const Route = createFileRoute("/_authenticated/gerer-actualites")({
  head: () => ({
    meta: [
      { title: "Happy Place — Gérer les actualités" },
      {
        name: "description",
        content: "Espace admin : rédiger, publier, archiver et restaurer les actualités.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { nouvelle?: boolean } =>
    s.nouvelle ? { nouvelle: true } : {},
  beforeLoad: ({ context }) => {
    if (context.role !== "admin") throw redirect({ to: "/" });
  },
  component: ManageNewsPage,
});

type TabKey = "apublier" | "publiees" | "archivees";

function ManageNewsPage() {
  const qc = useQueryClient();
  const { role, email, user } = Route.useRouteContext();
  const search = Route.useSearch();
  const myEmail = (email ?? "").toLowerCase();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const myName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    myEmail;
  const myDepartment = (DEPARTMENTS as readonly string[]).includes(String(meta.department))
    ? String(meta.department)
    : "";

  const [tab, setTab] = useState<TabKey>("apublier");
  const [editor, setEditor] = useState<{ news: News | null } | null>(
    search.nouvelle ? { news: null } : null,
  );

  const news = useQuery({ queryKey: ["news"], queryFn: fetchNews, retry: false });
  const all = useMemo(() => news.data ?? [], [news.data]);
  const onError = (e: unknown) => toast.error((e as Error).message);
  const refresh = () => qc.invalidateQueries({ queryKey: ["news"] });

  const publish = useMutation({
    mutationFn: publishDraftNews,
    onSuccess: () => {
      toast.success("Actualité publiée");
      refresh();
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) => setNewsArchived(v.id, v.archived),
    onSuccess: (_d, v) => {
      toast.success(
        v.archived ? "Actualité supprimée : elle est dans les archivées" : "Actualité restaurée",
      );
      refresh();
    },
    onError,
  });
  const erase = useMutation({
    mutationFn: (n: News) => deleteDraftNews(n.id, n.image_path),
    onSuccess: () => {
      toast.success("Actualité supprimée définitivement");
      refresh();
    },
    onError,
  });

  const toPublish = all
    .filter((n) => !isLive(n) && !n.archived_at)
    .sort((a, b) => Number(isScheduled(a)) - Number(isScheduled(b)) || byDateDesc(a, b));
  const published = all.filter(isLive).sort(byDateDesc);
  const archived = all.filter((n) => !!n.archived_at).sort(byDateDesc);

  const tabs: { key: TabKey; label: string; rows: News[]; hint: string; empty: string }[] = [
    {
      key: "apublier",
      label: "À publier",
      rows: toPublish,
      hint: "Brouillons et actualités programmées : rien n'est visible des collaborateurs tant que ce n'est pas publié.",
      empty: "Aucun brouillon ni publication programmée.",
    },
    {
      key: "publiees",
      label: "Publiées",
      rows: published,
      hint: "Actualités visibles dans le fil, les plus récentes d'abord.",
      empty: "Aucune actualité publiée.",
    },
    {
      key: "archivees",
      label: "Archivées",
      rows: archived,
      hint: "Actualités retirées du fil, visibles des admins seulement. « Restaurer » les remet dans le fil.",
      empty: "Aucune actualité archivée.",
    },
  ];
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  const statusLabel = (n: News) =>
    n.archived_at
      ? "Archivée"
      : isScheduled(n)
        ? "Programmée"
        : n.status === "brouillon"
          ? "Brouillon"
          : "Publiée";

  return (
    <AppShell
      role={role}
      email={email}
      eyebrow="Espace admin"
      title="Gérer les actualités"
      actions={
        <>
          <Link
            to="/"
            className="flex items-center gap-xs rounded px-md py-xs border border-primary bg-transparent text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            <Icon name="arrow_back" /> RETOUR AUX ACTUALITÉS
          </Link>
          <button
            type="button"
            onClick={() => setEditor({ news: null })}
            disabled={!!editor && !editor.news}
            className="flex items-center gap-xs rounded bg-primary px-md py-xs text-on-primary font-label-md text-label-md disabled:opacity-50"
          >
            <Icon name="add" /> NOUVELLE ACTUALITÉ
          </button>
        </>
      }
    >
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

      <section className="rounded border border-outline-variant bg-card">
        <div
          role="tablist"
          aria-label="États des actualités"
          className="flex gap-xs overflow-x-auto border-b border-outline-variant px-sm"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-xs whitespace-nowrap border-b-[3px] px-sm py-sm font-label-md text-label-md ${
                tab === t.key
                  ? "border-secondary-fixed font-bold text-primary"
                  : "border-transparent text-on-surface-variant hover:text-primary"
              }`}
            >
              {t.label}
              <span className="rounded bg-secondary-fixed px-xs font-label-sm text-label-sm text-on-secondary">
                {t.rows.length}
              </span>
            </button>
          ))}
        </div>
        <p className="bg-surface-container px-md py-xs font-body-sm text-body-sm text-on-surface-variant">
          {current.hint}
        </p>
        {news.isLoading && (
          <p className="px-md py-sm text-body-sm text-on-surface-variant">Chargement…</p>
        )}
        {news.isError && (
          <p className="px-md py-sm text-body-sm text-error">Les actualités sont indisponibles.</p>
        )}
        {news.data && current.rows.length === 0 && (
          <p className="px-md py-lg text-center text-body-sm italic text-on-surface-variant">
            {current.empty}
          </p>
        )}
        <div role="tabpanel">
          {current.rows.map((n) => (
            <div
              key={n.id}
              className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant px-md py-sm last:border-b-0"
            >
              <div className="min-w-0 flex-1 basis-80 space-y-xs">
                <p className="font-body-md font-bold text-primary wrap-anywhere">{n.title}</p>
                <div className="flex flex-wrap items-center gap-xs font-label-sm text-label-sm text-on-surface-variant">
                  <span className="rounded border border-outline-variant bg-surface-container px-xs py-0.5">
                    {statusLabel(n)}
                  </span>
                  <span>
                    {n.author}
                    {n.department ? ` · ${n.department}` : ""}
                    {isScheduled(n)
                      ? ` · le ${new Date(publishedAt(n)).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`
                      : ""}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-sm">
                {tab !== "archivees" && (
                  <button
                    type="button"
                    className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                    onClick={() => setEditor({ news: n })}
                  >
                    Modifier
                  </button>
                )}
                {tab === "apublier" && n.status === "brouillon" && (
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
                {tab === "archivees" ? (
                  <>
                    <button
                      type="button"
                      disabled={archive.isPending}
                      className="rounded border border-primary px-sm py-1 text-primary font-label-sm text-label-sm hover:bg-surface-container"
                      onClick={() => archive.mutate({ id: n.id, archived: false })}
                    >
                      Restaurer
                    </button>
                    <button
                      type="button"
                      disabled={erase.isPending}
                      className="font-label-sm text-label-sm text-error"
                      onClick={() =>
                        window.confirm(`Supprimer définitivement « ${n.title} » ?`) &&
                        erase.mutate(n)
                      }
                    >
                      Supprimer définitivement
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={archive.isPending}
                    className="font-label-sm text-label-sm text-error"
                    onClick={() =>
                      window.confirm(
                        `Supprimer « ${n.title} » ? Elle ira dans les actualités archivées.`,
                      ) && archive.mutate({ id: n.id, archived: true })
                    }
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
