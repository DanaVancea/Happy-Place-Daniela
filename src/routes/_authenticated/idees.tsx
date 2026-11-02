import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ErrorSummary,
  Field,
  FormActions,
  Modal,
  TextArea,
  TextInput,
} from "@/components/manage/crud-ui";
import {
  rejectionSchema,
  submissionSchema,
  validate,
  type FieldErrors,
} from "@/lib/manage-schemas";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { AttachmentLink } from "@/components/attachment-link";
import {
  CharCounter,
  SubmissionPreview,
  rejectionErrorMessage,
} from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { SubmissionReader } from "@/components/submission-reader";
import { ValidatedSubmissions } from "@/components/dashboard-extras";
import { Button } from "@/components/ui/button";
import {
  fetchSubmissions,
  fetchMySubmissions,
  exportMyRecentSubmissions,
  REJECTION_CATEGORIES,
  reviewSubmission,
  submitIdea,
  timeAgo,
  type Submission,
  type SubmissionInput,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/idees")({
  head: () => ({
    meta: [
      { title: "Happy Place — Idées" },
      {
        name: "description",
        content:
          "Soumettez une idée pour votre équipe et retrouvez les idées précédentes et leur suite.",
      },
    ],
  }),
  component: IdeasPage,
});

function IdeasPage() {
  const qc = useQueryClient();
  const { role, email } = Route.useRouteContext();
  const canReview = role === "admin" || role === "manager";
  const myEmail = (email ?? "").toLowerCase();
  const [submissionForm, setSubmissionForm] = useState<SubmissionInput | null>(null);
  const [submissionErrors, setSubmissionErrors] = useState<FieldErrors>({});
  const [attachment, setAttachment] = useState<File | null>(null);
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [reading, setReading] = useState<Submission | null>(null);
  const [rejectForm, setRejectForm] = useState({ rejection_category: "", rejection_note: "" });
  const [rejectErrors, setRejectErrors] = useState<FieldErrors>({});

  const myTeams = useQuery({
    queryKey: ["manager_teams", "mine", email],
    enabled: role === "manager" && !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_teams")
        .select("team, allowed_users!inner(email)")
        .eq("allowed_users.email", myEmail);
      if (error) throw error;
      return (data ?? []).map((t) => t.team).sort();
    },
  });
  const pending = useQuery({ queryKey: ["submissions"], queryFn: fetchSubmissions, retry: false });
  const mine = useQuery({
    queryKey: ["submissions", "mine", email],
    queryFn: () => fetchMySubmissions(email ?? ""),
    enabled: !!email,
    retry: false,
  });

  const exportReport = useMutation({
    mutationFn: () => {
      if (!email) throw new Error("Votre adresse e-mail est indisponible.");
      return exportMyRecentSubmissions(email);
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("Aucune soumission en attente ou validée sur les 30 derniers jours.");
        return;
      }
      toast.success(
        `${count} soumission${count > 1 ? "s" : ""} exportée${count > 1 ? "s" : ""} au format CSV.`,
      );
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const review = useMutation({
    mutationFn: reviewSubmission,
    onSuccess: (_d, vars) => {
      if (vars.status === "refusée") {
        setRejecting(null);
        toast.success("Soumission refusée");
      } else {
        setReading((r) => (r?.id === vars.id ? null : r));
      }
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
    onError: (e: unknown) => toast.error(rejectionErrorMessage(e)),
  });

  const submit = useMutation({
    mutationFn: (input: SubmissionInput) =>
      submitIdea(
        { author_name: input.author_name, team: input.team, content: input.content },
        attachment,
      ),
    onSuccess: () => {
      setSubmissionForm(null);
      setAttachment(null);
      setSubmissionErrors({});
      toast.success("Soumission envoyée");
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
    onError: (e: unknown) => toast.error(rejectionErrorMessage(e)),
  });

  function startReject(s: Submission) {
    setReading(null);
    setRejecting(s);
    setRejectErrors({});
    setRejectForm({ rejection_category: "", rejection_note: "" });
  }

  function openForm() {
    setSubmissionErrors({});
    const only = role === "manager" && myTeams.data?.length === 1 ? myTeams.data[0] : "";
    setSubmissionForm({ author_name: "", team: only, content: "", status: "en attente" });
  }

  function sendSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!submissionForm) return;
    // Collaborateur : l'équipe est fixée côté serveur à partir du compte.
    // Admin : toujours l'équipe « Admin » ; manager : une de ses équipes.
    const team =
      role === "collaborateur" ? "auto" : role === "admin" ? "Admin" : submissionForm.team;
    const result = validate(submissionSchema, { ...submissionForm, team, status: "en attente" });
    if (!result.ok) {
      setSubmissionErrors(result.errors);
      return;
    }
    setSubmissionErrors({});
    submit.mutate(result.data);
  }

  return (
    <AppShell
      role={role}
      email={email}
      eyebrow="Boîte à idées"
      title="Idées"
      actions={
        <>
          <button
            onClick={openForm}
            className="flex items-center gap-xs rounded px-md py-xs bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 transition-all"
          >
            <Icon name="add" /> SOUMETTRE UNE IDÉE
          </button>
          <Button
            type="button"
            variant="outline"
            disabled={exportReport.isPending}
            onClick={() => exportReport.mutate()}
            className="h-auto rounded border-primary bg-transparent px-md py-xs font-label-md text-label-md text-primary shadow-none hover:bg-surface-container"
          >
            <Icon name="file_download" />{" "}
            {exportReport.isPending ? "EXPORT EN COURS…" : "EXPORTER LE RAPPORT"}
          </Button>
        </>
      }
    >
      <p className="max-w-3xl text-body-md text-on-surface-variant">
        {role === "collaborateur" &&
          "Tu soumets une idée pour ton équipe. Ton manager la valide ou la refuse, avec un motif."}
        {role === "manager" &&
          "Tu soumets une idée pour l'une de tes équipes et tu valides ou refuses celles de tes équipes."}
        {role === "admin" && "Tu vois et traites les idées de toutes les équipes."}
      </p>

      <div className="bento-grid">
        {canReview && (
          <section className="col-span-12 lg:col-span-5 min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg p-md flex flex-col">
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
              <h2 className="font-headline-sm text-headline-sm text-primary">Idées à traiter</h2>
              <div className="bg-tertiary-fixed text-on-tertiary-fixed px-xs py-1 rounded font-label-sm text-label-sm">
                {pending.data?.length ?? 0} EN ATTENTE
              </div>
            </div>
            <div className="space-y-sm flex-grow min-w-0">
              {pending.isError && (
                <p className="text-body-sm text-error">Les soumissions sont indisponibles.</p>
              )}
              {pending.data?.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucune idée en attente.
                </p>
              )}
              {pending.data?.map((s) => (
                <div
                  key={s.id}
                  className="p-sm border border-outline-variant rounded bg-card space-y-sm min-w-0 overflow-hidden"
                >
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center">
                      <Icon name="person" className="text-sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-body-sm text-primary font-bold wrap-anywhere">
                        {s.author_name}
                      </p>
                      <p className="text-[10px] text-on-surface-variant font-label-sm wrap-anywhere">
                        {s.team}
                      </p>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-label-sm whitespace-nowrap">
                      {timeAgo(s.created_at)}
                    </span>
                  </div>
                  <SubmissionPreview content={s.content} onOpen={() => setReading(s)} />
                  <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
                  <div className="flex gap-xs pt-xs">
                    <button
                      onClick={() => startReject(s)}
                      className="flex-1 rounded py-1 border border-primary text-primary font-label-sm text-label-sm hover:bg-surface-container transition-colors"
                    >
                      REFUSER
                    </button>
                    <button
                      onClick={() => review.mutate({ id: s.id, status: "validée" })}
                      className="flex-1 rounded py-1 bg-primary text-on-primary font-label-sm text-label-sm hover:opacity-90 transition-colors"
                    >
                      VALIDER
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section
          className={`col-span-12 ${canReview ? "lg:col-span-7" : ""} min-w-0 bg-surface-container-lowest border border-outline-variant rounded-lg p-md`}
        >
          <h2 className="font-headline-sm text-headline-sm text-primary border-b border-outline-variant pb-sm mb-md">
            Mes idées précédentes
          </h2>
          {mine.isError && <p className="text-body-sm text-error">Tes idées sont indisponibles.</p>}
          {mine.data?.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Tu n'as pas encore soumis d'idée.
            </p>
          )}
          <div className="space-y-xs">
            {mine.data?.map((s) => (
              <div
                key={s.id}
                className="p-sm border border-outline-variant rounded bg-card min-w-0 overflow-hidden"
              >
                <SubmissionPreview content={s.content} onOpen={() => setReading(s)} />
                <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
                <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                  {s.status} • {s.team} • {timeAgo(s.created_at)}
                </p>
                {s.status === "refusée" && s.rejection_category && (
                  <div className="mt-xs p-xs rounded bg-error-container text-on-error-container text-body-sm wrap-anywhere">
                    <p className="font-bold">Motif : {s.rejection_category}</p>
                    <p className="whitespace-pre-line">
                      Raison : <Linkify text={s.rejection_note ?? ""} />
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <ValidatedSubmissions
          role={role}
          email={myEmail}
          managerTeams={myTeams.data ?? []}
          onRead={setReading}
        />
      </div>

      <SubmissionReader
        submission={reading}
        onClose={() => setReading(null)}
        onReject={
          reading && canReview && reading.status === "en attente"
            ? () => startReject(reading)
            : undefined
        }
        onApprove={
          reading && canReview && reading.status === "en attente"
            ? () => review.mutate({ id: reading.id, status: "validée" })
            : undefined
        }
        approving={review.isPending}
      />
      {rejecting && (
        <Modal title="Refuser la soumission" onClose={() => setRejecting(null)}>
          <form
            noValidate
            className="space-y-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const res = validate(rejectionSchema, rejectForm);
              if (!res.ok) return setRejectErrors(res.errors);
              setRejectErrors({});
              review.mutate({ id: rejecting.id, status: "refusée", ...res.data });
            }}
          >
            <p className="max-h-48 overflow-y-auto border border-outline-variant bg-surface-container-low p-xs text-body-sm italic text-on-surface-variant whitespace-pre-line wrap-anywhere">
              “{rejecting.content}”
            </p>
            <ErrorSummary errors={rejectErrors} />
            <Field label="Motif du refus" error={rejectErrors.rejection_category}>
              <select
                className="w-full border border-outline-variant bg-card p-xs text-body-sm"
                value={rejectForm.rejection_category}
                onChange={(e) =>
                  setRejectForm({ ...rejectForm, rejection_category: e.target.value })
                }
              >
                <option value="">— Choisir un motif —</option>
                {REJECTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Raison du refus (obligatoire)" error={rejectErrors.rejection_note}>
              <TextArea
                rows={4}
                value={rejectForm.rejection_note}
                placeholder="Explique au collaborateur pourquoi sa soumission est refusée…"
                onChange={(e) => setRejectForm({ ...rejectForm, rejection_note: e.target.value })}
              />
              <CharCounter value={rejectForm.rejection_note} max={500} />
            </Field>
            <FormActions pending={review.isPending} onCancel={() => setRejecting(null)} />
          </form>
        </Modal>
      )}
      {submissionForm && (
        <Modal title="Soumettre une proposition" onClose={() => setSubmissionForm(null)}>
          <form onSubmit={sendSubmission} className="space-y-sm" noValidate>
            <ErrorSummary errors={submissionErrors} />
            <Field label="Nom" error={submissionErrors.author_name}>
              <TextInput
                value={submissionForm.author_name}
                maxLength={80}
                placeholder="Ton nom"
                onChange={(e) =>
                  setSubmissionForm({ ...submissionForm, author_name: e.target.value })
                }
              />
            </Field>
            {role === "manager" && (
              <Field label="Équipe" error={submissionErrors.team}>
                <select
                  required
                  value={submissionForm.team}
                  onChange={(e) => setSubmissionForm({ ...submissionForm, team: e.target.value })}
                  className="w-full border border-outline-variant bg-surface px-sm py-xs font-body-md"
                >
                  <option value="">Choisis une de tes équipes</option>
                  {myTeams.data?.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {role === "admin" && (
              <p className="text-body-sm text-on-surface-variant">Équipe : Admin</p>
            )}
            <Field label="Proposition" error={submissionErrors.content}>
              <TextArea
                rows={5}
                value={submissionForm.content}
                placeholder="Décris l'amélioration proposée pour le cabinet…"
                onChange={(e) => setSubmissionForm({ ...submissionForm, content: e.target.value })}
              />
              <CharCounter value={submissionForm.content} max={2000} min={5} />
            </Field>
            <Field label="Document PDF (optionnel, 20 Mo max)" error={submissionErrors.attachment}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="block w-full text-body-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.type !== "application/pdf") {
                    setSubmissionErrors({
                      ...submissionErrors,
                      attachment: "Seuls les fichiers PDF sont acceptés.",
                    });
                    e.target.value = "";
                    setAttachment(null);
                    return;
                  }
                  if (f && f.size > 20 * 1024 * 1024) {
                    setSubmissionErrors({
                      ...submissionErrors,
                      attachment: "Le fichier dépasse 20 Mo.",
                    });
                    e.target.value = "";
                    setAttachment(null);
                    return;
                  }
                  const { attachment: _a, ...rest } = submissionErrors;
                  setSubmissionErrors(rest);
                  setAttachment(f);
                }}
              />
            </Field>
            <FormActions
              pending={submit.isPending}
              submitLabel="ENVOYER"
              onCancel={() => setSubmissionForm(null)}
            />
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
