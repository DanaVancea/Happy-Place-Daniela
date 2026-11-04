import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ConfirmDelete,
  ErrorSummary,
  Field,
  FormActions,
  Modal,
  RowActions,
  Select,
  TextArea,
  TextInput,
} from "@/components/manage/crud-ui";
import { SEVERITIES, severityMeta } from "@/lib/blockers";
import { fetchTeams } from "@/lib/ideas";
import { blockerSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import {
  createBlocker,
  deleteBlocker,
  fetchAllBlockers,
  timeAgo,
  updateBlocker,
  type Blocker,
  type BlockerInput,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/manage/blockers")({
  head: () => ({
    meta: [
      { title: "Gestion des points bloquants — Happy Place" },
      {
        name: "description",
        content: "Créez, modifiez et supprimez les points bloquants dans Happy Place.",
      },
      { property: "og:title", content: "Gestion des points bloquants — Happy Place" },
      {
        property: "og:description",
        content: "Gérez les alertes opérationnelles des missions de recrutement dans Happy Place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManageBlockers,
});

const severityLabels: Record<string, string> = Object.fromEntries(
  SEVERITIES.map((v) => [v, `${severityMeta(v).rank} · ${severityMeta(v).label}`]),
);

const empty: BlockerInput = {
  title: "",
  description: "",
  department: "",
  severity: "moyenne",
  status: "OUVERT",
  sensitive_team: null,
};

function ManageBlockers() {
  const qc = useQueryClient();
  const [form, setForm] = useState<BlockerInput | null>(null);
  const [editing, setEditing] = useState<Blocker | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toDelete, setToDelete] = useState<Blocker | null>(null);

  const teams = useQuery({ queryKey: ["teams"], queryFn: fetchTeams, retry: false });
  const list = useQuery({ queryKey: ["blockers", "all"], queryFn: fetchAllBlockers, retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["blockers"] });
  const onError = (e: unknown) => toast.error((e as Error).message);

  const save = useMutation({
    mutationFn: (input: BlockerInput) =>
      editing ? updateBlocker(editing.id, input) : createBlocker(input).then(() => undefined),
    onSuccess: () => {
      toast.success(editing ? "Point bloquant modifié" : "Point bloquant créé");
      close();
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBlocker(id),
    onSuccess: () => {
      toast.success("Point bloquant supprimé");
      setToDelete(null);
      invalidate();
    },
    onError,
  });

  function close() {
    setForm(null);
    setEditing(null);
    setErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const res = validate(blockerSchema, form);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    save.mutate(res.data);
  }

  return (
    <section className="space-y-md">
      <div className="flex items-center justify-between">
        <h2 className="font-headline-sm text-headline-sm text-primary">
          Points bloquants ({list.data?.length ?? 0})
        </h2>
        <button
          onClick={() => {
            setEditing(null);
            setErrors({});
            setForm({ ...empty });
          }}
          className="px-md py-xs bg-primary text-on-primary font-label-md text-label-md"
        >
          + NOUVEAU POINT BLOQUANT
        </button>
      </div>

      {list.isLoading && <p className="text-body-sm text-on-surface-variant">Chargement…</p>}
      {list.isError && (
        <p className="text-body-sm text-error">Impossible de charger les points bloquants.</p>
      )}

      <div className="space-y-xs">
        {list.data?.map((b) => (
          <article
            key={b.id}
            className="flex items-start justify-between gap-sm p-sm bg-card border border-outline-variant"
          >
            <div>
              <p className="font-body-md text-primary font-bold">{b.title}</p>
              <p className="text-body-sm text-on-surface-variant">{b.description}</p>
              <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                {b.department} • {severityLabels[b.severity] ?? b.severity} • {b.status} •{" "}
                {timeAgo(b.updated_at)}
              </p>
            </div>
            <RowActions
              onEdit={() => {
                setEditing(b);
                setErrors({});
                setForm({
                  title: b.title,
                  description: b.description ?? "",
                  department: b.department,
                  severity: b.severity,
                  status: b.status,
                  sensitive_team: b.sensitive_team ?? null,
                });
              }}
              onDelete={() => setToDelete(b)}
            />
          </article>
        ))}
        {list.data?.length === 0 && (
          <p className="text-body-sm italic text-on-surface-variant">Aucun point bloquant.</p>
        )}
      </div>

      {form && (
        <Modal
          title={editing ? "Modifier le point bloquant" : "Nouveau point bloquant"}
          onClose={close}
        >
          <form onSubmit={submit} className="space-y-sm" noValidate>
            <ErrorSummary errors={errors} />
            <Field label="Titre" error={errors.title}>
              <TextInput
                value={form.title}
                maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Description" error={errors.description}>
              <TextArea
                rows={4}
                value={form.description}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Équipe concernée" error={errors.department}>
              <Select
                value={form.department}
                onChange={(e) =>
                  setForm({
                    ...form,
                    department: e.target.value,
                    sensitive_team: form.sensitive_team ? e.target.value || null : null,
                  })
                }
              >
                <option value="">Choisir une équipe…</option>
                {form.department && !teams.data?.includes(form.department) && (
                  <option value={form.department}>{form.department}</option>
                )}
                {(teams.data ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Criticité" error={errors.severity}>
              <Select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                {SEVERITIES.map((v) => (
                  <option key={v} value={v}>
                    {severityLabels[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Statut" error={errors.status}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="OUVERT">OUVERT</option>
                <option value="EN COURS">EN COURS</option>
                <option value="SURVEILLANCE">SURVEILLANCE</option>
                {editing && (
                  <option
                    value="RÉSOLU"
                    disabled={form.status === "OUVERT"}
                    title={form.status === "OUVERT" ? "Passe d'abord par EN COURS" : undefined}
                  >
                    RÉSOLU
                  </option>
                )}
              </Select>
            </Field>
            <Field label="Visibilité" error={errors.sensitive_team}>
              <Select
                value={form.sensitive_team ? "prive" : "public"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sensitive_team: e.target.value === "prive" ? form.department || null : null,
                  })
                }
              >
                <option value="public">Public</option>
                <option value="prive">Privé</option>
              </Select>
            </Field>
            <FormActions pending={save.isPending} onCancel={close} />
          </form>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDelete
          label={toDelete.title}
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        />
      )}
    </section>
  );
}
