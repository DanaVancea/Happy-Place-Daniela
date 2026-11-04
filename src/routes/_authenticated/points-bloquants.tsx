import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { BlockerArchive } from "@/components/dashboard-extras";
import {
  createBlocker,
  fetchBlockers,
  timeAgo,
  updateBlockerStatus,
  type Blocker,
} from "@/lib/dashboard";
import { fetchMyTeams, fetchTeams } from "@/lib/ideas";
import {
  ACTION_STATUSES,
  archiveBlocker,
  SEVERITIES,
  canEditBlocker,
  createBlockerAction,
  deleteBlockerAction,
  fetchAssignableUsers,
  fetchBlockerActions,
  fetchBlockerHistory,
  severityMeta,
  updateBlockerActionStatus,
  updateBlockerSettings,
  type ActionStatus,
  type BlockerAction,
} from "@/lib/blockers";
import {
  FormActions,
  Field,
  Modal,
  Select,
  TextArea,
  TextInput,
} from "@/components/manage/crud-ui";

export const Route = createFileRoute("/_authenticated/points-bloquants")({
  head: () => ({
    meta: [
      { title: "Happy Place — Points bloquants" },
      {
        name: "description",
        content: "Les points bloquants en cours, leur criticité et leur statut.",
      },
    ],
  }),
  component: BlockersPage,
});

const dateFr = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function BlockersPage() {
  const qc = useQueryClient();
  const { role, email } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [newActionFor, setNewActionFor] = useState<Blocker | null>(null);
  const [newBlockerOpen, setNewBlockerOpen] = useState(false);
  const blockers = useQuery({ queryKey: ["blockers"], queryFn: fetchBlockers, retry: false });
  const actions = useQuery({
    queryKey: ["blocker-actions"],
    queryFn: fetchBlockerActions,
    retry: false,
  });
  const mine = useQuery({
    queryKey: ["my-teams", email],
    queryFn: () => fetchMyTeams(email),
    enabled: role === "manager",
    retry: false,
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    enabled: isAdmin,
    retry: false,
  });
  const ctx = { role, managed: mine.data?.managed ?? [] };
  const creatableTeams = isAdmin ? (teams.data ?? []) : ctx.managed;
  const canCreate = isAdmin || (role === "manager" && ctx.managed.length > 0);

  const onError = (e: unknown) => toast.error((e as Error).message);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["blockers"] });
    qc.invalidateQueries({ queryKey: ["blocker-actions"] });
    qc.invalidateQueries({ queryKey: ["blocker-history"] });
  };
  const archive = useMutation({ mutationFn: archiveBlocker, onSuccess: refresh, onError });
  const setBlocker = useMutation({ mutationFn: updateBlockerStatus, onSuccess: refresh, onError });
  const setSettings = useMutation({
    mutationFn: updateBlockerSettings,
    onSuccess: refresh,
    onError,
  });
  const setActionStatus = useMutation({
    mutationFn: updateBlockerActionStatus,
    onSuccess: refresh,
    onError,
  });
  const removeAction = useMutation({
    mutationFn: deleteBlockerAction,
    onSuccess: refresh,
    onError,
  });

  const sorted = [...(blockers.data ?? [])].sort(
    (a, b) =>
      severityMeta(a.severity).rank - severityMeta(b.severity).rank ||
      b.updated_at.localeCompare(a.updated_at),
  );

  return (
    <AppShell
      role={role}
      email={email}
      eyebrow="Suivi opérationnel"
      title="Points bloquants"
      actions={
        <div className="flex flex-wrap gap-xs">
          {canCreate && (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setNewBlockerOpen(true)}
              className="flex items-center gap-xs rounded px-md py-xs bg-primary text-on-primary font-label-md text-label-md"
            >
              <Icon name="add" /> NOUVEAU POINT BLOQUANT
            </button>
          )}
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setArchiveOpen(true)}
            className="flex items-center gap-xs rounded px-md py-xs border border-primary bg-transparent text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            <Icon name="inventory_2" /> VOIR L'ARCHIVE
          </button>
        </div>
      }
    >
      <section className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md">
        <div className="space-y-sm">
          {blockers.isError && (
            <p className="text-body-sm text-error">Les points bloquants sont indisponibles.</p>
          )}
          {blockers.data?.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Aucun point bloquant en cours.
            </p>
          )}
          {sorted.map((b) => {
            const sev = severityMeta(b.severity);
            const editable = canEditBlocker(ctx, b.department);
            const list = (actions.data ?? []).filter((a) => a.blocker_id === b.id);
            return (
              <article
                key={b.id}
                className={`${b.severity === "critique" ? "accent-bar " : ""}bg-card border border-outline-variant rounded p-sm space-y-sm`}
              >
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-xs mb-xs">
                      {editable ? (
                        <select
                          aria-label={`Criticité de ${b.title}`}
                          value={b.severity}
                          onChange={(e) =>
                            setSettings.mutate({
                              id: b.id,
                              severity: e.target.value as (typeof SEVERITIES)[number],
                            })
                          }
                          className={`rounded border px-xs py-0.5 text-[11px] font-label-sm ${sev.badge}`}
                        >
                          {SEVERITIES.map((s) => (
                            <option key={s} value={s}>
                              {severityMeta(s).rank} · {severityMeta(s).label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-xs py-0.5 text-[11px] font-label-sm ${sev.badge}`}
                        >
                          <Icon name={sev.icon} className="text-[14px]" />
                          {sev.rank} · {sev.label}
                        </span>
                      )}
                      <span className="rounded text-[11px] font-label-sm bg-surface-container-highest px-xs py-0.5">
                        Équipe : {b.department}
                      </span>
                      {b.sensitive_team && (
                        <span className="inline-flex items-center gap-1 rounded border border-outline px-xs py-0.5 text-[11px] font-label-sm">
                          <Icon name="lock" className="text-[14px]" /> Sujet sensible
                        </span>
                      )}
                    </div>
                    <p className="font-body-md text-primary font-bold wrap-anywhere">{b.title}</p>
                    <p className="text-body-sm text-on-surface-variant wrap-anywhere">
                      {b.description}
                    </p>
                    <span className="text-[11px] font-label-sm text-on-surface-variant">
                      Mis à jour {timeAgo(b.updated_at)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-xs">
                    {editable ? (
                      <select
                        aria-label={`Statut de ${b.title}`}
                        value={b.status}
                        onChange={(e) => setBlocker.mutate({ id: b.id, status: e.target.value })}
                        className="bg-transparent border border-outline-variant rounded text-xs font-label-sm text-on-surface-variant cursor-pointer"
                      >
                        <option>OUVERT</option>
                        <option>EN COURS</option>
                        <option>SURVEILLANCE</option>
                        <option
                          disabled={b.status === "OUVERT"}
                          title={b.status === "OUVERT" ? "Passe d'abord par EN COURS" : undefined}
                        >
                          RÉSOLU
                        </option>
                      </select>
                    ) : (
                      <span className="text-xs font-label-sm text-on-surface-variant">
                        {b.status}
                      </span>
                    )}
                    {editable && b.status === "RÉSOLU" && (
                      <button
                        type="button"
                        onClick={() => archive.mutate(b.id)}
                        className="flex items-center gap-1 px-sm py-0.5 border border-primary text-primary font-label-sm text-label-sm hover:bg-surface-container"
                      >
                        <Icon name="inventory_2" className="text-[16px]" /> ARCHIVER
                      </button>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <label className="flex flex-wrap items-center gap-xs text-[11px] font-label-sm text-on-surface-variant">
                    Visibilité :
                    <select
                      value={b.sensitive_team ? "prive" : "public"}
                      onChange={(e) =>
                        setSettings.mutate({
                          id: b.id,
                          sensitive_team: e.target.value === "prive" ? b.department : null,
                        })
                      }
                      className="bg-card border border-outline-variant rounded px-xs py-0.5"
                    >
                      <option value="public">Public</option>
                      <option value="prive">Privé</option>
                    </select>
                  </label>
                )}

                <div className="border-t border-outline-variant pt-xs">
                  <div className="flex items-center justify-between gap-sm">
                    <h3 className="font-label-md text-label-md text-primary uppercase">
                      Actions ({list.length})
                    </h3>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setNewActionFor(b)}
                        className="px-sm py-0.5 border border-primary text-primary font-label-sm text-label-sm hover:bg-surface-container"
                      >
                        + NOUVELLE ACTION
                      </button>
                    )}
                  </div>
                  {list.length === 0 && (
                    <p className="text-body-sm text-on-surface-variant italic">Aucune action.</p>
                  )}
                  <ul className="space-y-xs mt-xs">
                    {list.map((a) => (
                      <ActionRow
                        key={a.id}
                        a={a}
                        canEdit={editable}
                        isOwner={a.owner_email.toLowerCase() === email.toLowerCase()}
                        onStatus={(status) => setActionStatus.mutate({ id: a.id, status })}
                        onDelete={() => removeAction.mutate(a.id)}
                      />
                    ))}
                  </ul>
                </div>
                {editable && <History blockerId={b.id} />}
              </article>
            );
          })}
        </div>
      </section>
      {newBlockerOpen && (
        <NewBlockerModal
          teams={creatableTeams}
          canSetVisibility={isAdmin}
          onClose={() => setNewBlockerOpen(false)}
          onCreated={() => {
            setNewBlockerOpen(false);
            refresh();
          }}
        />
      )}
      {newActionFor && (
        <NewActionModal
          blocker={newActionFor}
          onClose={() => setNewActionFor(null)}
          onCreated={() => {
            setNewActionFor(null);
            refresh();
          }}
        />
      )}
      <BlockerArchive open={archiveOpen} onClose={() => setArchiveOpen(false)} />
    </AppShell>
  );
}

const ACTION_ICON: Record<ActionStatus, string> = {
  prévue: "schedule",
  "en cours": "autorenew",
  faite: "check_circle",
};

function ActionRow({
  a,
  canEdit,
  isOwner,
  onStatus,
  onDelete,
}: {
  a: BlockerAction;
  canEdit: boolean;
  isOwner: boolean;
  onStatus: (s: ActionStatus) => void;
  onDelete: () => void;
}) {
  const late = a.status !== "faite" && a.due_date < new Date().toISOString().slice(0, 10);
  return (
    <li className="flex flex-wrap items-center justify-between gap-xs text-body-sm">
      <div className="flex items-center gap-xs min-w-0">
        <Icon name={ACTION_ICON[a.status]} className="text-on-surface-variant text-[18px]" />
        <span
          className={`wrap-anywhere ${a.status === "faite" ? "line-through text-on-surface-variant" : "text-primary"}`}
        >
          {a.title}
        </span>
        <span className="text-[11px] font-label-sm text-on-surface-variant">
          · {a.owner_name} · échéance {dateFr(a.due_date)}
          {late ? " · EN RETARD" : ""}
        </span>
      </div>
      <div className="flex items-center gap-xs">
        {canEdit || isOwner ? (
          <select
            aria-label={`Statut de l'action ${a.title}`}
            value={a.status}
            onChange={(e) => onStatus(e.target.value as ActionStatus)}
            className="bg-transparent border border-outline-variant rounded text-xs font-label-sm"
          >
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-label-sm text-on-surface-variant">{a.status}</span>
        )}
        {canEdit && (
          <button
            type="button"
            aria-label={`Supprimer l'action ${a.title}`}
            onClick={onDelete}
            className="text-on-surface-variant hover:text-error"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        )}
      </div>
    </li>
  );
}

function NewActionModal({
  blocker,
  onClose,
  onCreated,
}: {
  blocker: Blocker;
  onClose: () => void;
  onCreated: () => void;
}) {
  const users = useQuery({
    queryKey: ["assignable-users"],
    queryFn: fetchAssignableUsers,
    retry: false,
  });
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<ActionStatus>("prévue");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: createBlockerAction,
    onSuccess: () => {
      toast.success("Action ajoutée");
      onCreated();
    },
    onError: (e: unknown) => setError((e as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const person = users.data?.find((u) => u.email === owner);
    if (title.trim().length < 3) return setError("Décris l'action (3 caractères minimum).");
    if (!person) return setError("Choisis la personne responsable.");
    if (!due) return setError("La date d'échéance est obligatoire.");
    setError(null);
    create.mutate({
      blocker_id: blocker.id,
      title: title.trim(),
      owner_email: person.email,
      owner_name: person.name,
      due_date: due,
      status,
    });
  }

  return (
    <Modal title={`Nouvelle action — ${blocker.title}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-sm" noValidate>
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
        <Field label="Action">
          <TextInput value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Responsable (peut être d'une autre équipe)">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Choisir une personne…</option>
            {(users.data ?? []).map((u) => (
              <option key={u.email} value={u.email}>
                {u.name}
                {u.team ? ` — ${u.team}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Échéance">
          <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Statut">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ActionStatus)}>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <FormActions pending={create.isPending} onCancel={onClose} submitLabel="AJOUTER" />
      </form>
    </Modal>
  );
}

function History({ blockerId }: { blockerId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["blocker-history", blockerId],
    queryFn: () => fetchBlockerHistory(blockerId),
    enabled: open,
    retry: false,
  });
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-[11px] font-label-sm text-on-surface-variant underline"
      >
        {open ? "Masquer l'historique" : "Voir l'historique des modifications"}
      </button>
      {open && (
        <ul className="mt-xs space-y-0.5 text-[12px] text-on-surface-variant">
          {q.isError && <li className="text-error">Historique indisponible.</li>}
          {q.data?.length === 0 && <li className="italic">Aucune modification enregistrée.</li>}
          {q.data?.map((h) => (
            <li key={h.id}>
              {new Date(h.changed_at).toLocaleString("fr-FR")} · {h.changed_by_name} · {h.summary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewBlockerModal({
  teams,
  canSetVisibility,
  onClose,
  onCreated,
}: {
  teams: string[];
  canSetVisibility: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState(teams.length === 1 ? teams[0] : "");
  const [severity, setSeverity] = useState<string>("moyenne");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: createBlocker,
    onSuccess: () => {
      toast.success("Point bloquant créé");
      onCreated();
    },
    onError: (e: unknown) => setError((e as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return setError("Le titre doit faire au moins 3 caractères.");
    if (!department) return setError("Choisis l'équipe concernée.");
    setError(null);
    create.mutate({
      title: title.trim(),
      description: description.trim(),
      department,
      severity,
      status: "OUVERT",
      sensitive_team: isPrivate ? department : null,
    });
  }

  return (
    <Modal title="Nouveau point bloquant" onClose={onClose}>
      <form onSubmit={submit} className="space-y-sm" noValidate>
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
        <Field label="Titre">
          <TextInput value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description">
          <TextArea
            rows={3}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Équipe concernée">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Choisir une équipe…</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Criticité">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map((v) => (
              <option key={v} value={v}>
                {severityMeta(v).rank} · {severityMeta(v).label}
              </option>
            ))}
          </Select>
        </Field>
        {canSetVisibility && (
          <Field label="Visibilité">
            <Select
              value={isPrivate ? "prive" : "public"}
              onChange={(e) => setIsPrivate(e.target.value === "prive")}
            >
              <option value="public">Public</option>
              <option value="prive">Privé</option>
            </Select>
          </Field>
        )}
        <FormActions pending={create.isPending} onCancel={onClose} submitLabel="CRÉER" />
      </form>
    </Modal>
  );
}
