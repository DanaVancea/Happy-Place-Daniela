import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { BlockerArchive } from "@/components/dashboard-extras";
import {
  createBlocker,
  deleteBlocker,
  fetchBlockers,
  timeAgo,
  updateBlockerStatus,
  type Blocker,
} from "@/lib/dashboard";
import { fetchMyTeams, fetchTeams } from "@/lib/ideas";
import {
  ACTION_STATUSES,
  ACTION_STATUS_META,
  BLOCKER_STATUS_META,
  archiveBlocker,
  SEVERITIES,
  canDeleteBlocker,
  canEditBlocker,
  updateBlockerContent,
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
  ConfirmDelete,
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
  const { role, email, user } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [newActionFor, setNewActionFor] = useState<Blocker | null>(null);
  const [newBlockerOpen, setNewBlockerOpen] = useState(false);
  const [editingBlocker, setEditingBlocker] = useState<Blocker | null>(null);
  const [blockerToDelete, setBlockerToDelete] = useState<Blocker | null>(null);
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
  const ctx = { role, managed: mine.data?.managed ?? [], userId: user?.id ?? null };
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
  const removeBlocker = useMutation({
    mutationFn: (id: string) => deleteBlocker(id),
    onSuccess: () => {
      toast.success("Point bloquant supprimé");
      setBlockerToDelete(null);
      refresh();
    },
    onError,
  });
  const removeAction = useMutation({
    mutationFn: deleteBlockerAction,
    onSuccess: refresh,
    onError,
  });

  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const teamsInList = [...new Set((blockers.data ?? []).map((b) => b.department))].sort((x, y) =>
    x.localeCompare(y, "fr"),
  );
  const bySeverity = (x: Blocker, y: Blocker) =>
    severityMeta(x.severity).rank - severityMeta(y.severity).rank;
  const byTeam = (x: Blocker, y: Blocker) => x.department.localeCompare(y.department, "fr");
  const sorted = (blockers.data ?? [])
    .filter(
      (x) =>
        (!filterSeverity || x.severity === filterSeverity) &&
        (!filterTeam || x.department === filterTeam),
    )
    .sort((x, y) => bySeverity(x, y) || byTeam(x, y) || y.updated_at.localeCompare(x.updated_at));

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
        <div className="space-y-md">
          <div className="flex flex-wrap items-end gap-sm">
            <label className="text-[11px] font-label-sm text-on-surface-variant uppercase">
              Criticité
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="block mt-1 bg-card border border-outline-variant rounded px-xs py-1 text-body-sm normal-case"
              >
                <option value="">Toutes</option>
                {SEVERITIES.map((v) => (
                  <option key={v} value={v}>
                    {severityMeta(v).rank} · {severityMeta(v).label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-label-sm text-on-surface-variant uppercase">
              Équipe concernée
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="block mt-1 bg-card border border-outline-variant rounded px-xs py-1 text-body-sm normal-case"
              >
                <option value="">Toutes</option>
                {teamsInList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {blockers.isError && (
            <p className="text-body-sm text-error">Les points bloquants sont indisponibles.</p>
          )}
          {blockers.data && blockers.data.length > 0 && sorted.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Aucun point bloquant ne correspond à ces filtres.
            </p>
          )}
          {blockers.data?.length === 0 && (
            <p className="text-body-sm text-on-surface-variant italic">
              Aucun point bloquant en cours.
            </p>
          )}
          {sorted.map((b) => {
            const sev = severityMeta(b.severity);
            const editable = canEditBlocker(ctx, b.department);
            const mayDelete = canDeleteBlocker(ctx, b);
            // Modifier : l'admin, ou le manager qui a créé le point.
            const mayEditContent = mayDelete;
            const list = (actions.data ?? []).filter((a) => a.blocker_id === b.id);
            // Responsable d'une action du point : peut changer le statut du point, et seulement lui.
            const isPointOwner = list.some(
              (a) => a.owner_email.toLowerCase() === email.toLowerCase(),
            );
            return (
              <article
                key={b.id}
                className={`${b.severity === "critique" ? "accent-bar " : ""}bg-card border-2 border-outline rounded p-md space-y-sm shadow-sm`}
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
                        <span className="inline-flex items-center gap-1 rounded border border-error bg-error-container text-on-error-container px-xs py-0.5 text-[11px] font-label-sm">
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
                    {editable || isPointOwner ? (
                      <select
                        aria-label={`Statut de ${b.title}`}
                        value={b.status}
                        onChange={(e) => setBlocker.mutate({ id: b.id, status: e.target.value })}
                        className={`border-2 rounded px-sm py-xs text-body-md font-label-md font-bold cursor-pointer ${BLOCKER_STATUS_META[b.status]?.badge ?? ""}`}
                      >
                        <option className="bg-card text-primary">OUVERT</option>
                        <option className="bg-card text-primary">EN COURS</option>
                        <option className="bg-card text-primary">SURVEILLANCE</option>
                        <option
                          className="bg-card text-primary"
                          disabled={b.status === "OUVERT"}
                          title={b.status === "OUVERT" ? "Passe d'abord par EN COURS" : undefined}
                        >
                          RÉSOLU
                        </option>
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 rounded border-2 px-sm py-xs text-body-md font-label-md font-bold ${BLOCKER_STATUS_META[b.status]?.badge ?? ""}`}
                      >
                        <Icon
                          name={BLOCKER_STATUS_META[b.status]?.icon ?? "help"}
                          className="text-[18px]"
                        />
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

                {(mayEditContent || mayDelete) && (
                  <div className="flex flex-wrap gap-xs">
                    {mayEditContent && (
                      <button
                        type="button"
                        onClick={() => setEditingBlocker(b)}
                        className="flex items-center gap-1 px-sm py-0.5 border border-primary text-primary font-label-sm text-label-sm hover:bg-surface-container"
                      >
                        <Icon name="edit" className="text-[16px]" /> MODIFIER
                      </button>
                    )}
                    {mayDelete && (
                      <button
                        type="button"
                        onClick={() => setBlockerToDelete(b)}
                        className="flex items-center gap-1 px-sm py-0.5 border border-error text-error font-label-sm text-label-sm hover:bg-error-container"
                      >
                        <Icon name="delete" className="text-[16px]" /> SUPPRIMER
                      </button>
                    )}
                  </div>
                )}

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
      {editingBlocker && (
        <EditBlockerModal
          blocker={editingBlocker}
          teams={creatableTeams}
          onClose={() => setEditingBlocker(null)}
          onSaved={() => {
            setEditingBlocker(null);
            refresh();
          }}
        />
      )}
      {blockerToDelete && (
        <ConfirmDelete
          label={blockerToDelete.title}
          pending={removeBlocker.isPending}
          onCancel={() => setBlockerToDelete(null)}
          onConfirm={() => removeBlocker.mutate(blockerToDelete.id)}
        />
      )}
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
            className={`border rounded px-xs py-0.5 text-xs font-label-sm ${ACTION_STATUS_META[a.status]?.badge ?? ""}`}
          >
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-card text-primary">
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`inline-flex items-center gap-1 rounded border px-xs py-0.5 text-xs font-label-sm ${ACTION_STATUS_META[a.status]?.badge ?? ""}`}
          >
            {a.status}
          </span>
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

type Assignable = { email: string; name: string; team: string | null };
const ownerLabel = (u: Assignable) => (u.team ? `${u.name} — ${u.team}` : u.name);
const findOwner = (users: Assignable[] | undefined, text: string) => {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  return (users ?? []).find((u) => ownerLabel(u).toLowerCase() === t || u.name.toLowerCase() === t);
};

/** Champ de recherche du responsable : on tape le nom, les suggestions se filtrent. */
function OwnerInput({
  id,
  users,
  value,
  onChange,
  label,
}: {
  id: string;
  users: Assignable[] | undefined;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <>
      <TextInput
        list={id}
        aria-label={label}
        placeholder="Tape un nom…"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={id}>
        {(users ?? []).map((u) => (
          <option key={u.email} value={ownerLabel(u)} />
        ))}
      </datalist>
    </>
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
    const person = findOwner(users.data, owner);
    if (title.trim().length < 3) return setError("Décris l'action (3 caractères minimum).");
    if (!person) return setError("Choisis la personne responsable dans la liste de suggestions.");
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
          <OwnerInput
            id="owner-new-action"
            users={users.data}
            value={owner}
            onChange={setOwner}
            label="Responsable"
          />
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
  const users = useQuery({
    queryKey: ["assignable-users"],
    queryFn: fetchAssignableUsers,
    retry: false,
  });
  type Draft = { title: string; owner: string; due: string };
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const patchDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const create = useMutation({
    mutationFn: async (input: Parameters<typeof createBlocker>[0]) => {
      const id = await createBlocker(input);
      for (const d of drafts) {
        const person = findOwner(users.data, d.owner);
        if (!person) continue;
        await createBlockerAction({
          blocker_id: id,
          title: d.title.trim(),
          owner_email: person.email,
          owner_name: person.name,
          due_date: d.due,
          status: "prévue",
        });
      }
    },
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
    for (const [i, d] of drafts.entries()) {
      if (d.title.trim().length < 3)
        return setError(`Action ${i + 1} : décris l'action (3 caractères minimum).`);
      if (!findOwner(users.data, d.owner))
        return setError(`Action ${i + 1} : choisis la personne responsable dans la liste.`);
      if (!d.due) return setError(`Action ${i + 1} : la date d'échéance est obligatoire.`);
    }
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
        <div className="space-y-xs border-t border-outline-variant pt-sm">
          <div className="flex items-center justify-between gap-sm">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Actions ({drafts.length})
            </span>
            <button
              type="button"
              onClick={() => setDrafts([...drafts, { title: "", owner: "", due: "" }])}
              className="px-sm py-0.5 border border-primary text-primary font-label-sm text-label-sm hover:bg-surface-container"
            >
              + AJOUTER UNE ACTION
            </button>
          </div>
          {drafts.map((d, i) => (
            <div key={i} className="space-y-xs border border-outline-variant p-xs">
              <TextInput
                aria-label={`Action ${i + 1}`}
                placeholder="Action à mener"
                value={d.title}
                maxLength={200}
                onChange={(e) => patchDraft(i, { title: e.target.value })}
              />
              <OwnerInput
                id={`owner-draft-${i}`}
                users={users.data}
                value={d.owner}
                onChange={(v) => patchDraft(i, { owner: v })}
                label={`Responsable de l'action ${i + 1}`}
              />
              <div className="flex gap-xs">
                <TextInput
                  type="date"
                  aria-label={`Échéance de l'action ${i + 1}`}
                  value={d.due}
                  onChange={(e) => patchDraft(i, { due: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Retirer l'action ${i + 1}`}
                  onClick={() => setDrafts(drafts.filter((_, k) => k !== i))}
                  className="px-sm text-on-surface-variant hover:text-error"
                >
                  <Icon name="delete" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <FormActions pending={create.isPending} onCancel={onClose} submitLabel="CRÉER" />
      </form>
    </Modal>
  );
}

function EditBlockerModal({
  blocker,
  teams,
  onClose,
  onSaved,
}: {
  blocker: Blocker;
  teams: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(blocker.title);
  const [description, setDescription] = useState(blocker.description ?? "");
  const [department, setDepartment] = useState(blocker.department);
  const [error, setError] = useState<string | null>(null);
  const teamOptions = teams.includes(blocker.department) ? teams : [blocker.department, ...teams];
  const save = useMutation({
    mutationFn: updateBlockerContent,
    onSuccess: () => {
      toast.success("Point bloquant modifié");
      onSaved();
    },
    onError: (e: unknown) => setError((e as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) return setError("Le titre doit faire au moins 3 caractères.");
    setError(null);
    save.mutate({
      id: blocker.id,
      title: title.trim(),
      description: description.trim(),
      department,
    });
  }

  return (
    <Modal title="Modifier le point bloquant" onClose={onClose}>
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
            {teamOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <FormActions pending={save.isPending} onCancel={onClose} />
      </form>
    </Modal>
  );
}
