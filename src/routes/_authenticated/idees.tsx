import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ErrorSummary, Field, FormActions, Modal, TextArea } from "@/components/manage/crud-ui";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { CharCounter, formatExactDate } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { timeAgo } from "@/lib/dashboard";
import {
  IDEA_STATUS_LABEL,
  addComment,
  availableActions,
  canModerate,
  deleteComment,
  fetchComments,
  fetchIdeas,
  fetchLikes,
  fetchMyTeams,
  fetchTeams,
  ideaErrorMessage,
  moderateIdea,
  setLike,
  submitIdeaToTeam,
  type Idea,
  type IdeaStatus,
  type ModerationAction,
} from "@/lib/ideas";

export const Route = createFileRoute("/_authenticated/idees")({
  head: () => ({
    meta: [
      { title: "Happy Place — Boîte à idées" },
      {
        name: "description",
        content:
          "Proposez une idée pour votre équipe, votez et débattez des idées que votre manager a publiées.",
      },
    ],
  }),
  component: IdeasPage,
});

const ACTION_LABEL: Record<ModerationAction, string> = {
  valider: "VALIDER",
  debat: "SOUMETTRE EN DÉBAT",
  remonter: "REMONTER À LA SOCIÉTÉ",
  supprimer: "SUPPRIMER",
};

const STATUS_STYLE: Record<IdeaStatus, string> = {
  "en attente": "bg-tertiary-fixed text-on-tertiary-fixed",
  validée: "bg-secondary-fixed text-on-secondary-fixed",
  "en débat": "bg-surface-container-high text-primary",
  remontée: "bg-primary text-on-primary",
  supprimée: "bg-error-container text-on-error-container",
};

type Filter = "toutes" | "en débat" | "validée" | "remontée";

function IdeasPage() {
  const qc = useQueryClient();
  const { role, email, user } = Route.useRouteContext();
  const myEmail = (email ?? "").toLowerCase();
  const canReview = role === "admin" || role === "manager";

  const ideasQ = useQuery({ queryKey: ["ideas"], queryFn: fetchIdeas, retry: false });
  const likesQ = useQuery({ queryKey: ["idea_likes"], queryFn: fetchLikes, retry: false });
  const myTeamsQ = useQuery({
    queryKey: ["my_teams", myEmail],
    queryFn: () => fetchMyTeams(myEmail),
    enabled: !!myEmail,
    retry: false,
  });
  const teamsQ = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    enabled: canReview,
    retry: false,
  });
  const myTeam = myTeamsQ.data?.team ?? null;
  const managed = myTeamsQ.data?.managed ?? [];

  const [filter, setFilter] = useState<Filter>("toutes");
  const [teamFilter, setTeamFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ team: string; content: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [reasonFor, setReasonFor] = useState<{
    idea: Idea;
    action: "supprimer" | "remonter";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const ideas = ideasQ.data ?? [];
  const opened = ideas.find((i) => i.id === openId) ?? null;

  const likeCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of likesQ.data ?? []) m.set(l.idea_id, (m.get(l.idea_id) ?? 0) + 1);
    return m;
  }, [likesQ.data]);
  const myLikes = useMemo(
    () => new Set((likesQ.data ?? []).filter((l) => l.user_id === user.id).map((l) => l.idea_id)),
    [likesQ.data, user.id],
  );

  /** Peut voter / commenter : membre de l'équipe, manager de l'équipe ou admin. */
  function inTeam(idea: Idea) {
    if (role === "admin") return true;
    if (role === "manager" && managed.some((t) => t.toLowerCase() === idea.team.toLowerCase()))
      return true;
    return !!myTeam && myTeam.toLowerCase() === idea.team.toLowerCase();
  }

  const toModerate = ideas.filter(
    (i) =>
      canReview &&
      canModerate(role, managed, i) &&
      (i.status === "en attente" || (role === "admin" && i.status === "remontée")),
  );
  const mine = ideas.filter((i) => i.author_email.toLowerCase() === myEmail);
  const toModerateIds = new Set(toModerate.map((i) => i.id));
  const published = ideas.filter((i) => {
    if (toModerateIds.has(i.id)) return false;
    const okStatus =
      i.status === "validée" || i.status === "en débat" || (canReview && i.status === "remontée");
    if (!okStatus) return false;
    // Collaborateur : uniquement l'équipe actuelle (ses anciennes idées d'une autre équipe restent dans « Mes idées »)
    if (role === "collaborateur" && (!myTeam || myTeam.toLowerCase() !== i.team.toLowerCase()))
      return false;
    if (filter !== "toutes" && i.status !== filter) return false;
    if (teamFilter && i.team !== teamFilter) return false;
    return true;
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["ideas"] });
    qc.invalidateQueries({ queryKey: ["idea_likes"] });
  }

  const submit = useMutation({
    mutationFn: (v: { team: string; content: string }) => submitIdeaToTeam(v.team, v.content),
    onSuccess: () => {
      setForm(null);
      toast.success("Idée envoyée : elle sera visible de l'équipe après la décision du manager.");
      refresh();
    },
    onError: (e: unknown) => toast.error(ideaErrorMessage(e)),
  });

  const moderate = useMutation({
    mutationFn: moderateIdea,
    onSuccess: (_d, v) => {
      const done: Record<ModerationAction, string> = {
        valider: "Idée validée",
        supprimer: "Idée supprimée",
        debat: "Idée soumise en débat",
        remonter: "Idée remontée à la société",
      };
      toast.success(done[v.action]);
      setReasonFor(null);
      setReason("");
      refresh();
    },
    onError: (e: unknown) => toast.error(ideaErrorMessage(e)),
  });

  const like = useMutation({
    mutationFn: (v: { id: string; liked: boolean }) => setLike(v.id, user.id, v.liked),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idea_likes"] }),
    onError: (e: unknown) => toast.error(ideaErrorMessage(e)),
  });

  function openForm() {
    setFormErrors({});
    const only = role === "collaborateur" ? (myTeam ?? "") : managed.length === 1 ? managed[0] : "";
    setForm({ team: only, content: "" });
  }

  function sendForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const errors: Record<string, string> = {};
    const text = form.content.trim();
    if (role !== "collaborateur" && !form.team) errors.team = "Choisis l'équipe concernée";
    if (role === "collaborateur" && !myTeam) errors.team = "Tu n'as pas encore d'équipe";
    if (text.length < 5) errors.content = "5 caractères minimum";
    if (text.length > 2000) errors.content = "2 000 caractères maximum";
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    submit.mutate({ team: form.team, content: text });
  }

  function act(idea: Idea, action: ModerationAction) {
    if (action === "supprimer" || action === "remonter") {
      setReason("");
      setReasonError("");
      setOpenId(null); // ferme la lecture en grand : sinon elle s'affiche devant la fenêtre de raison
      setReasonFor({ idea, action });
      return;
    }
    moderate.mutate({ id: idea.id, action });
  }

  function sendReason(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonFor) return;
    const text = reason.trim();
    if (reasonFor.action === "supprimer" && text.length < 5) {
      setReasonError("La raison est obligatoire (5 caractères minimum).");
      return;
    }
    if (text.length > 500) {
      setReasonError("500 caractères maximum.");
      return;
    }
    moderate.mutate({ id: reasonFor.idea.id, action: reasonFor.action, reason: text });
  }

  const intro =
    role === "collaborateur"
      ? `Tu proposes une idée pour ton équipe${myTeam ? ` (${myTeam})` : ""}. Elle n'est visible de l'équipe qu'après la décision de ton manager.`
      : role === "manager"
        ? "Tu vois les idées de toutes les équipes et tu peux en proposer pour n'importe laquelle. Tu modères celles de ton équipe."
        : "Tu vois et traites les idées de toutes les équipes, y compris celles remontées à la société.";

  return (
    <AppShell
      role={role}
      email={email}
      eyebrow="Idées par équipe"
      title="Boîte à idées"
      actions={
        <button
          onClick={openForm}
          className="flex items-center gap-xs rounded px-md py-xs bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 transition-all"
        >
          <Icon name="add" /> SOUMETTRE UNE IDÉE
        </button>
      }
    >
      <p className="max-w-3xl text-body-md text-on-surface-variant">{intro}</p>
      {ideasQ.isError && (
        <p role="alert" className="text-body-sm text-error">
          Les idées sont indisponibles. La migration « idées par équipe » a-t-elle été appliquée ?
        </p>
      )}

      <div className="bento-grid">
        {canReview && (
          <section className="col-span-12 lg:col-span-5 min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex flex-col">
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
              <h2 className="font-headline-sm text-headline-sm text-primary">Idées à traiter</h2>
              <div className="bg-tertiary-fixed text-on-tertiary-fixed px-xs py-1 rounded font-label-sm text-label-sm">
                {toModerate.length} À TRAITER
              </div>
            </div>
            <div className="space-y-sm min-w-0">
              {toModerate.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucune idée en attente de décision.
                </p>
              )}
              {toModerate.map((i) => (
                <div
                  key={i.id}
                  className="p-sm border border-outline-variant rounded bg-card space-y-sm min-w-0 overflow-hidden"
                >
                  <IdeaMeta idea={i} />
                  <button
                    type="button"
                    onClick={() => setOpenId(i.id)}
                    className="block w-full text-left text-body-sm text-on-surface line-clamp-3 wrap-anywhere hover:underline"
                  >
                    {i.content}
                  </button>
                  <div className="flex flex-wrap gap-xs pt-xs">
                    {availableActions(role, i).map((a) => (
                      <button
                        key={a}
                        disabled={moderate.isPending}
                        onClick={() => act(i, a)}
                        className={`flex-1 min-w-[8rem] rounded py-1 font-label-sm text-label-sm transition-colors disabled:opacity-60 ${
                          a === "valider"
                            ? "bg-primary text-on-primary hover:opacity-90"
                            : "border border-primary text-primary hover:bg-surface-container"
                        }`}
                      >
                        {ACTION_LABEL[a]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section
          className={`col-span-12 ${canReview ? "lg:col-span-7" : ""} min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg p-md`}
        >
          <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant pb-sm mb-md">
            <h2 className="font-headline-sm text-headline-sm text-primary">
              {canReview ? "Idées des équipes" : "Idées de mon équipe"}
            </h2>
            <div className="flex flex-wrap items-center gap-xs">
              {(
                ["toutes", "en débat", "validée", ...(canReview ? ["remontée"] : [])] as Filter[]
              ).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`rounded px-sm py-1 font-label-sm text-label-sm border ${
                    filter === f
                      ? "bg-primary text-on-primary border-primary"
                      : "border-outline-variant text-primary hover:bg-surface-container"
                  }`}
                >
                  {f === "toutes"
                    ? "TOUTES"
                    : f === "en débat"
                      ? "EN DÉBAT"
                      : f === "validée"
                        ? "VALIDÉES"
                        : "REMONTÉES"}
                </button>
              ))}
              {canReview && (
                <select
                  aria-label="Filtrer par équipe"
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="border border-outline-variant bg-card px-xs py-1 text-body-sm"
                >
                  <option value="">Toutes les équipes</option>
                  {teamsQ.data?.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {published.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Aucune idée publiée pour le moment.
            </p>
          )}
          <div className="space-y-xs">
            {published.map((i) => (
              <div
                key={i.id}
                className="p-sm border border-outline-variant rounded bg-card min-w-0 overflow-hidden space-y-xs"
              >
                <IdeaMeta idea={i} />
                <button
                  type="button"
                  onClick={() => setOpenId(i.id)}
                  className="block w-full text-left text-body-sm text-on-surface line-clamp-3 wrap-anywhere hover:underline"
                >
                  {i.content}
                </button>
                <div className="flex items-center gap-sm pt-xs">
                  <LikeButton
                    idea={i}
                    count={likeCount.get(i.id) ?? 0}
                    liked={myLikes.has(i.id)}
                    allowed={inTeam(i)}
                    pending={like.isPending}
                    onToggle={() => like.mutate({ id: i.id, liked: !myLikes.has(i.id) })}
                  />
                  <button
                    type="button"
                    onClick={() => setOpenId(i.id)}
                    className="font-label-sm text-label-sm text-primary underline"
                  >
                    {i.status === "en débat" ? "PARTICIPER AU DÉBAT" : "LIRE"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-12 min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg p-md">
          <h2 className="font-headline-sm text-headline-sm text-primary border-b border-outline-variant pb-sm mb-md">
            Mes idées
          </h2>
          {mine.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Tu n'as pas encore soumis d'idée.
            </p>
          )}
          <div className="grid gap-xs md:grid-cols-2">
            {mine.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setOpenId(i.id)}
                className="text-left p-sm border border-outline-variant rounded bg-card min-w-0 overflow-hidden space-y-xs hover:bg-surface-container"
              >
                <IdeaMeta idea={i} hideAuthor />
                <p className="text-body-sm text-on-surface line-clamp-3 wrap-anywhere">
                  {i.content}
                </p>
                {i.status === "supprimée" && (
                  <p className="p-xs rounded bg-error-container text-on-error-container text-body-sm wrap-anywhere">
                    Raison : {i.deletion_reason}
                  </p>
                )}
                {i.status === "remontée" && (
                  <p className="text-body-sm text-on-surface-variant">
                    Remontée par {i.moderated_by_name ?? "ton manager"}
                    {i.escalation_note ? ` — ${i.escalation_note}` : ""}
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>

      <IdeaDialog
        idea={opened}
        onClose={() => setOpenId(null)}
        userId={user.id}
        role={role}
        canAct={!!opened && canModerate(role, managed, opened)}
        inTeam={!!opened && inTeam(opened)}
        likeCount={opened ? (likeCount.get(opened.id) ?? 0) : 0}
        liked={!!opened && myLikes.has(opened.id)}
        likePending={like.isPending}
        onLike={() => opened && like.mutate({ id: opened.id, liked: !myLikes.has(opened.id) })}
        onAction={(a) => opened && act(opened, a)}
        actionPending={moderate.isPending}
      />

      {reasonFor && (
        <Modal
          title={
            reasonFor.action === "supprimer" ? "Supprimer l'idée" : "Remonter l'idée à la société"
          }
          onClose={() => setReasonFor(null)}
        >
          <form noValidate onSubmit={sendReason} className="space-y-sm">
            <p className="max-h-40 overflow-y-auto border border-outline-variant bg-surface-container-low p-xs text-body-sm italic text-on-surface-variant whitespace-pre-line wrap-anywhere">
              “{reasonFor.idea.content}”
            </p>
            <Field
              label={
                reasonFor.action === "supprimer"
                  ? "Raison de la suppression (obligatoire, visible de l'auteur)"
                  : "Note pour les admins (optionnelle)"
              }
              error={reasonError}
            >
              <TextArea
                rows={4}
                value={reason}
                placeholder={
                  reasonFor.action === "supprimer"
                    ? "Explique à l'auteur pourquoi son idée est supprimée…"
                    : "Pourquoi cette idée est d'intérêt général…"
                }
                onChange={(e) => setReason(e.target.value)}
              />
              <CharCounter value={reason} max={500} />
            </Field>
            <FormActions
              pending={moderate.isPending}
              submitLabel={reasonFor.action === "supprimer" ? "SUPPRIMER" : "REMONTER"}
              onCancel={() => setReasonFor(null)}
            />
          </form>
        </Modal>
      )}

      {form && (
        <Modal title="Soumettre une idée" onClose={() => setForm(null)}>
          <form onSubmit={sendForm} className="space-y-sm" noValidate>
            <ErrorSummary errors={formErrors} />
            {role === "collaborateur" ? (
              <p className="text-body-sm text-on-surface-variant">
                Équipe : <strong>{myTeam ?? "aucune équipe attribuée"}</strong>
              </p>
            ) : (
              <Field label="Équipe concernée" error={formErrors.team}>
                <select
                  value={form.team}
                  onChange={(e) => setForm({ ...form, team: e.target.value })}
                  className="w-full border border-outline-variant bg-surface px-sm py-xs font-body-md"
                >
                  <option value="">Choisis une équipe</option>
                  {teamsQ.data?.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Ton idée" error={formErrors.content}>
              <TextArea
                rows={5}
                value={form.content}
                placeholder="Décris l'amélioration que tu proposes…"
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <CharCounter value={form.content} max={2000} min={5} />
            </Field>
            <FormActions
              pending={submit.isPending}
              submitLabel="ENVOYER"
              onCancel={() => setForm(null)}
            />
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

function StatusBadge({ status }: { status: IdeaStatus }) {
  return (
    <span
      className={`rounded px-xs py-[2px] font-label-sm text-[10px] uppercase whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {IDEA_STATUS_LABEL[status]}
    </span>
  );
}

function IdeaMeta({ idea, hideAuthor }: { idea: Idea; hideAuthor?: boolean }) {
  return (
    <div className="flex items-center gap-sm">
      <div className="min-w-0 flex-1">
        <p className="font-body-sm text-primary font-bold wrap-anywhere">
          {hideAuthor ? idea.team : idea.author_name}
        </p>
        <p className="text-[10px] text-on-surface-variant font-label-sm wrap-anywhere">
          {hideAuthor ? "" : `${idea.team} • `}
          {timeAgo(idea.created_at)}
          {idea.status === "remontée" && idea.moderated_by_name
            ? ` • remontée par ${idea.moderated_by_name}`
            : ""}
        </p>
      </div>
      <StatusBadge status={idea.status} />
    </div>
  );
}

function LikeButton({
  idea,
  count,
  liked,
  allowed,
  pending,
  onToggle,
}: {
  idea: Idea;
  count: number;
  liked: boolean;
  allowed: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  const votable = idea.status === "validée" || idea.status === "en débat";
  if (!votable) return null;
  return (
    <button
      type="button"
      disabled={!allowed || pending}
      onClick={onToggle}
      aria-pressed={liked}
      aria-label={`${count} vote${count > 1 ? "s" : ""}${allowed ? (liked ? ", retirer mon vote" : ", voter") : ""}`}
      className={`flex items-center gap-xs rounded border px-sm py-1 font-label-sm text-label-sm disabled:opacity-60 ${
        liked
          ? "bg-primary text-on-primary border-primary"
          : "border-outline-variant text-primary hover:bg-surface-container"
      }`}
    >
      <Icon name="thumb_up" className="text-sm" /> {count}
    </button>
  );
}

function IdeaDialog({
  idea,
  onClose,
  userId,
  role,
  canAct,
  inTeam,
  likeCount,
  liked,
  likePending,
  onLike,
  onAction,
  actionPending,
}: {
  idea: Idea | null;
  onClose: () => void;
  userId: string;
  role: string;
  canAct: boolean;
  inTeam: boolean;
  likeCount: number;
  liked: boolean;
  likePending: boolean;
  onLike: () => void;
  onAction: (a: ModerationAction) => void;
  actionPending: boolean;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const showComments = !!idea && (idea.status === "en débat" || idea.status === "validée");
  const comments = useQuery({
    queryKey: ["idea_comments", idea?.id],
    queryFn: () => fetchComments(idea!.id),
    enabled: showComments,
    retry: false,
  });
  const send = useMutation({
    mutationFn: () => addComment(idea!.id, body),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["idea_comments", idea?.id] });
    },
    onError: (e: unknown) => toast.error(ideaErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idea_comments", idea?.id] }),
    onError: (e: unknown) => toast.error(ideaErrorMessage(e)),
  });

  const actions = idea && canAct ? availableActions(role, idea) : [];
  const debating = idea?.status === "en débat";

  return (
    <DialogPrimitive.Root open={!!idea} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        {idea && (
          <DialogPrimitive.Content className="fixed z-50 inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full md:w-[min(48rem,calc(100vw-2rem))] h-dvh md:h-auto md:max-h-[85vh] flex flex-col bg-surface-container-lowest border border-outline shadow-lg focus:outline-none">
            <div className="flex items-start justify-between gap-sm border-b border-outline-variant p-md">
              <div className="min-w-0 space-y-xs">
                <DialogPrimitive.Title className="font-headline-sm text-headline-sm text-primary wrap-anywhere">
                  {idea.author_name}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="font-label-sm text-label-sm text-on-surface-variant">
                  {idea.team} • Soumise le {formatExactDate(idea.created_at)}
                </DialogPrimitive.Description>
                <StatusBadge status={idea.status} />
              </div>
              <DialogPrimitive.Close
                aria-label="Fermer"
                className="text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span aria-hidden="true" className="material-symbols-outlined">
                  close
                </span>
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-md space-y-md">
              <p className="font-body-md text-body-md text-on-surface whitespace-pre-line wrap-anywhere">
                <Linkify text={idea.content} />
              </p>
              {idea.status === "remontée" && (
                <div className="p-sm bg-surface-container text-body-sm wrap-anywhere">
                  <p className="font-bold">
                    Remontée à la société par {idea.moderated_by_name ?? "le manager"}
                  </p>
                  {idea.escalation_note && (
                    <p className="whitespace-pre-line">
                      <Linkify text={idea.escalation_note} />
                    </p>
                  )}
                </div>
              )}
              {idea.status === "supprimée" && (
                <div className="p-sm bg-error-container text-on-error-container text-body-sm wrap-anywhere">
                  <p className="font-bold">
                    Supprimée par {idea.moderated_by_name ?? "le manager"}
                  </p>
                  <p className="whitespace-pre-line">Raison : {idea.deletion_reason}</p>
                </div>
              )}
              {(idea.status === "validée" || debating) && (
                <div className="flex items-center gap-sm">
                  <LikeButton
                    idea={idea}
                    count={likeCount}
                    liked={liked}
                    allowed={inTeam}
                    pending={likePending}
                    onToggle={onLike}
                  />
                  {!inTeam && (
                    <span className="text-body-sm text-on-surface-variant">
                      Seule l'équipe concernée peut voter.
                    </span>
                  )}
                </div>
              )}
              {showComments && (
                <div className="space-y-sm">
                  <h3 className="font-label-md text-label-md text-primary uppercase">
                    {debating ? "Débat" : "Commentaires du débat"}
                  </h3>
                  {comments.data?.length === 0 && (
                    <p className="text-body-sm text-on-surface-variant italic">
                      Aucun commentaire pour le moment.
                    </p>
                  )}
                  {comments.data?.map((c) => (
                    <div
                      key={c.id}
                      className="border border-outline-variant p-sm rounded bg-card wrap-anywhere"
                    >
                      <div className="flex items-center justify-between gap-sm">
                        <p className="font-body-sm text-primary font-bold">{c.author_name}</p>
                        <span className="text-[10px] text-on-surface-variant font-label-sm whitespace-nowrap">
                          {timeAgo(c.created_at)}
                        </span>
                      </div>
                      <p className="text-body-sm whitespace-pre-line">
                        <Linkify text={c.body} />
                      </p>
                      {(c.author_id === userId || canAct) && (
                        <button
                          type="button"
                          onClick={() => remove.mutate(c.id)}
                          className="mt-xs font-label-sm text-label-sm text-on-surface-variant underline"
                        >
                          SUPPRIMER
                        </button>
                      )}
                    </div>
                  ))}
                  {debating && inTeam && (
                    <form
                      noValidate
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (body.trim()) send.mutate();
                      }}
                      className="space-y-xs"
                    >
                      <TextArea
                        rows={3}
                        value={body}
                        aria-label="Ton commentaire"
                        placeholder="Ajoute ton avis au débat…"
                        onChange={(e) => setBody(e.target.value)}
                      />
                      <CharCounter value={body} max={1000} />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={send.isPending || !body.trim()}
                          className="px-md py-xs bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50"
                        >
                          {send.isPending ? "…" : "COMMENTER"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-xs border-t border-outline-variant p-md">
                {actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={actionPending}
                    onClick={() => onAction(a)}
                    className={`flex-1 min-w-[9rem] py-sm font-label-sm text-label-sm transition-colors disabled:opacity-60 ${
                      a === "valider"
                        ? "bg-primary text-on-primary hover:opacity-90"
                        : "border border-outline text-primary hover:bg-surface-container"
                    }`}
                  >
                    {ACTION_LABEL[a]}
                  </button>
                ))}
              </div>
            )}
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
