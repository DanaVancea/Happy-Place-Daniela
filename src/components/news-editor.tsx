import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { NewsMediaEditor } from "@/components/news-media";
import {
  emptyMedia,
  linkErrors,
  mediaFromNews,
  toNewsLinks,
  type MediaDraft,
} from "@/lib/news-media";
import type { News } from "@/lib/dashboard";
import {
  DEPARTMENTS,
  LEVELS,
  LEVEL_LABELS,
  MAX_PINNED,
  fetchBlockedWords,
  findBlockedWord,
  isFeaturedNow,
  levelOf,
  saveNews,
  type Level,
} from "@/lib/news-feed";

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const field =
  "w-full rounded border border-outline-variant bg-card p-xs font-body-md focus:border-primary focus:outline-none";
const label = "font-label-md text-label-md text-on-surface-variant block";

/** Formulaire de rédaction : réservé à l'Admin (RH, DSI, Office management). */
export function NewsEditor({
  editing,
  all,
  author,
  email,
  myDepartment,
  onDone,
}: {
  editing: News | null;
  all: News[];
  author: string;
  email: string;
  /** Département de l'admin connecté (RH, DSI, Office management), s'il est connu. */
  myDepartment: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [summary, setSummary] = useState(editing?.summary ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  // Le département suit le profil de l'admin connecté ; on ne le demande qu'une fois s'il est inconnu.
  const known = editing?.department || myDepartment;
  const [department, setDepartment] = useState(known);
  const [level, setLevel] = useState<Level>(editing ? levelOf(editing) : "information");
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [publishAt, setPublishAt] = useState(toLocalInput(editing?.publish_at));
  const [until, setUntil] = useState(editing?.featured_until?.slice(0, 10) ?? "");
  const [media, setMedia] = useState<MediaDraft>(editing ? mediaFromNews(editing) : emptyMedia());
  const [showErrs, setShowErrs] = useState(false);
  const linkErrs = showErrs ? linkErrors(media.links) : {};
  const future = !!publishAt && new Date(publishAt).getTime() > Date.now();

  const blocked = useQuery({
    queryKey: ["blocked-words"],
    queryFn: fetchBlockedWords,
    retry: false,
  });
  const badWord = findBlockedWord(`${title} ${summary} ${body}`, blocked.data ?? []);

  const save = useMutation({
    mutationFn: (status: "brouillon" | "publiée") =>
      saveNews(
        {
          id: editing?.id,
          title: title.trim(),
          summary,
          body,
          department,
          level,
          pinned,
          publish_at: publishAt ? new Date(publishAt).toISOString() : null,
          featured_until: until ? new Date(`${until}T23:59:59`).toISOString() : null,
          author,
          author_email: email,
          links: toNewsLinks(media.links),
          media,
        },
        status,
      ),
    onSuccess: async (_d, status) => {
      // Premier enregistrement : on retient le département pour les prochaines actualités.
      if (!known && department) await supabase.auth.updateUser({ data: { department } });
      toast.success(
        status === "brouillon"
          ? "Brouillon enregistré"
          : future
            ? "Actualité programmée"
            : "Actualité publiée",
      );
      qc.invalidateQueries({ queryKey: ["news"] });
      onDone();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const submit = (status: "brouillon" | "publiée") => {
    if (!title.trim()) return toast.error("Le titre est obligatoire.");
    setShowErrs(true);
    if (Object.keys(linkErrors(media.links)).length)
      return toast.error("Corrige les liens invalides avant d'enregistrer.");
    if (status === "publiée") {
      if (badWord)
        return toast.error(`Le mot « ${badWord} » n'est pas autorisé. Retire-le pour publier.`);
      if (!department) return toast.error("Choisis ton département avant de publier.");
      if (!summary.trim()) return toast.error("Ajoute un chapô (deux phrases) avant de publier.");
      if (pinned) {
        const others = all.filter(
          (n) => n.id !== editing?.id && n.status === "publiée" && isFeaturedNow(n),
        );
        if (others.length >= MAX_PINNED)
          return toast.error(
            `${MAX_PINNED} actualités sont déjà épinglées. Désépingle-en une d'abord.`,
          );
      }
    }
    save.mutate(status);
  };

  return (
    <form
      className="space-y-md rounded-lg border border-outline-variant bg-card p-md"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="space-y-xs">
        <label htmlFor="n-title" className={label}>
          TITRE
        </label>
        <input
          id="n-title"
          className={field}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Saisis un titre…"
        />
      </div>
      <div className="space-y-xs">
        <label htmlFor="n-summary" className={label}>
          CHAPÔ (DEUX PHRASES, AFFICHÉ SUR LA CARTE)
        </label>
        <textarea
          id="n-summary"
          rows={2}
          className={field}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      <div className="space-y-xs">
        <label htmlFor="n-body" className={label}>
          CONTENU
        </label>
        <textarea
          id="n-body"
          rows={8}
          className={field}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Rédige l'actualité…"
        />
      </div>
      <div className="grid items-end gap-sm sm:grid-cols-2 lg:grid-cols-4">
        {!known && (
          <div className="space-y-xs">
            <label htmlFor="n-dep" className={label}>
              TON DÉPARTEMENT (UNE SEULE FOIS)
            </label>
            <select
              id="n-dep"
              className={field}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Choisir…</option>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-xs">
          <label htmlFor="n-level" className={label}>
            NIVEAU
          </label>
          <select
            id="n-level"
            className={field}
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-xs">
          <label htmlFor="n-pub" className={label}>
            PUBLICATION PROGRAMMÉE
          </label>
          <input
            id="n-pub"
            type="datetime-local"
            className={field}
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
        </div>
        <div className="space-y-xs">
          <label htmlFor="n-until" className={label}>
            FIN D'AFFICHAGE À LA UNE
          </label>
          <input
            id="n-until"
            type="date"
            className={field}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-xs font-body-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Épingler à la une ({MAX_PINNED} maximum)
      </label>
      <NewsMediaEditor
        value={media}
        onChange={setMedia}
        linkErrs={linkErrs}
        disabled={save.isPending}
        title={title}
      />
      {badWord && (
        <p role="alert" className="rounded bg-error-container p-xs font-body-sm text-error">
          Le mot « {badWord} » n'est pas autorisé : retire-le pour pouvoir publier. Tu peux toujours
          enregistrer un brouillon.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-sm">
        <button
          type="button"
          onClick={onDone}
          className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => submit("brouillon")}
          className="rounded border border-primary px-md py-xs text-primary font-label-md text-label-md hover:bg-surface-container disabled:opacity-50"
        >
          Enregistrer le brouillon
        </button>
        <button
          type="button"
          disabled={save.isPending || !!badWord}
          onClick={() => submit("publiée")}
          className="rounded bg-primary px-md py-xs text-on-primary font-label-md text-label-md disabled:opacity-50"
        >
          {future ? "Programmer" : "Publier"}
        </button>
      </div>
    </form>
  );
}
