import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { BulkImport } from "@/components/manage/bulk-import";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  decideDepartureRequest,
  deleteUser,
  departureState,
  downloadUserExport,
  fetchAuditLog,
  fetchDepartureRequests,
  fetchIdeaCountsByTeam,
  fetchUsers,
  frDay,
  isMissingFeature,
  ROLE_LABEL,
  sendInvitation,
  todayYmd,
  userLabel,
  type AppRole,
  type UserRow,
} from "@/lib/users-admin";

const VUES = ["utilisateurs", "equipes", "departs", "journal"] as const;
type Vue = (typeof VUES)[number];

export const Route = createFileRoute("/_authenticated/utilisateurs")({
  head: () => ({
    meta: [
      { title: "Happy Place — Gestion des utilisateurs" },
      {
        name: "description",
        content:
          "Créer des équipes, inviter des utilisateurs, changer les rôles et gérer les départs.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { vue?: Vue } => ({
    vue: VUES.includes(s.vue as Vue) ? (s.vue as Vue) : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (context.role !== "admin") throw redirect({ to: "/" });
  },
  component: UsersAdminPage,
});

const nameSchema = z.string().trim().max(100, "100 caractères maximum");
const emailSchema = z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(255);
const teamSchema = z
  .string()
  .trim()
  .min(2, "Nom d'équipe trop court")
  .max(60, "60 caractères maximum");

const btn =
  "px-sm py-1 border border-outline text-primary font-label-sm text-label-sm hover:bg-surface-container disabled:opacity-50";
const btnPrimary =
  "px-md py-xs bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50";
const field = "border border-outline-variant bg-surface px-sm py-xs font-body-md";
const card = "bg-surface-container-lowest border border-outline-variant p-md";

function UsersAdminPage() {
  const { role, email } = Route.useRouteContext();
  const { vue = "utilisateurs" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const users = useQuery({ queryKey: ["allowed_users"], queryFn: fetchUsers });
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("name, is_reserved");
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
      );
    },
  });
  const requests = useQuery({
    queryKey: ["departure_requests"],
    queryFn: fetchDepartureRequests,
    retry: false,
  });
  const pending = (requests.data ?? []).filter((r) => r.status === "en attente");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["allowed_users"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    qc.invalidateQueries({ queryKey: ["departure_requests"] });
    qc.invalidateQueries({ queryKey: ["admin_audit_log"] });
    qc.invalidateQueries({ queryKey: ["admin_departures_banner"] });
  };
  const missingMigration = requests.isError && isMissingFeature(requests.error);

  const leaving = (users.data ?? []).filter((u) => u.departure_date);
  const tabs: { id: Vue; label: string; count?: number }[] = [
    { id: "utilisateurs", label: "Utilisateurs" },
    { id: "equipes", label: "Équipes" },
    { id: "departs", label: "Départs", count: leaving.length + pending.length },
    { id: "journal", label: "Journal" },
  ];

  return (
    <AppShell role={role} email={email} eyebrow="Administration" title="Gestion des utilisateurs">
      {missingMigration && (
        <p className="rounded bg-surface-container p-sm text-body-sm text-on-surface-variant">
          Les départs, la suppression et le journal ne sont pas encore activés sur la base de
          données. Ils seront disponibles après l'application de la migration « gestion_utilisateurs
          ».
        </p>
      )}
      <div role="tablist" aria-label="Gestion des utilisateurs" className="flex flex-wrap gap-xs">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={vue === t.id}
            onClick={() => navigate({ search: { vue: t.id } })}
            className={`flex items-center gap-xs px-md py-xs border font-label-md text-label-md ${
              vue === t.id
                ? "bg-primary text-on-primary border-primary"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {t.label.toUpperCase()}
            {!!t.count && (
              <span className="rounded bg-tertiary-fixed px-xs font-label-sm text-label-sm text-on-tertiary-fixed">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {vue === "utilisateurs" && (
        <UsersView
          me={email ?? ""}
          users={users.data ?? []}
          loading={users.isLoading}
          teams={(teamsQuery.data ?? []).filter((t) => !t.is_reserved).map((t) => t.name)}
          onChanged={refresh}
        />
      )}
      {vue === "equipes" && (
        <TeamsView users={users.data ?? []} teams={teamsQuery.data ?? []} onChanged={refresh} />
      )}
      {vue === "departs" && (
        <DeparturesView
          me={email ?? ""}
          users={users.data ?? []}
          pending={pending}
          onChanged={refresh}
        />
      )}
      {vue === "journal" && <AuditView />}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------------------

function UsersView({
  me,
  users,
  loading,
  teams,
  onChanged,
}: {
  me: string;
  users: UserRow[];
  loading: boolean;
  teams: string[];
  onChanged: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mail, setMail] = useState("");
  const [role, setRole] = useState<AppRole>("collaborateur");
  const [team, setTeam] = useState("");
  const [sendMail, setSendMail] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [toDelete, setToDelete] = useState<UserRow | null>(null);
  const [roleDialog, setRoleDialog] = useState<{ user: UserRow; team: string } | null>(null);
  const onError = (e: unknown) => toast.error((e as Error).message);

  const add = useMutation({
    mutationFn: async (v: {
      email: string;
      role: AppRole;
      team: string | null;
      first_name: string | null;
      last_name: string | null;
      invite: boolean;
    }) => {
      const { data, error } = await supabase
        .from("allowed_users")
        .insert({ email: v.email, team: v.team, first_name: v.first_name, last_name: v.last_name })
        .select("id")
        .single();
      if (error)
        throw new Error(
          error.code === "23505" ? "Cet e-mail est déjà dans la liste" : error.message,
        );
      const { error: roleError } = await supabase
        .from("allowed_user_roles")
        .insert({ allowed_user_id: data.id, role: v.role });
      if (roleError) {
        await supabase.from("allowed_users").delete().eq("id", data.id);
        throw roleError;
      }
      if (v.role === "manager" && v.team) {
        const { error: teamError } = await supabase
          .from("manager_teams")
          .insert({ allowed_user_id: data.id, team: v.team });
        if (teamError) throw teamError;
      }
      if (!v.invite) return "test" as const;
      try {
        return await sendInvitation(v.email);
      } catch (e) {
        throw new Error(
          `Utilisateur ajouté, mais l'invitation n'a pas pu être envoyée : ${(e as Error).message}`,
        );
      }
    },
    onSuccess: (result) => {
      setMail("");
      setFirstName("");
      setLastName("");
      setTeam("");
      if (result === "envoyée") toast.success("Utilisateur ajouté, invitation envoyée par e-mail");
      else if (result === "indisponible")
        toast.warning(
          "Utilisateur ajouté, mais l'envoi d'e-mail n'est pas encore activé (fonction « inviter-utilisateur » à déployer).",
        );
      else toast.success("Utilisateur ajouté (mode test : aucun e-mail envoyé)");
      onChanged();
    },
    onError: (e) => {
      onError(e);
      onChanged();
    },
  });

  const changeRole = useMutation({
    mutationFn: async (v: { id: string; role: AppRole; team?: string }) => {
      if (v.role === "collaborateur") {
        const parsed = teamSchema.safeParse(v.team ?? "");
        if (!parsed.success)
          throw new Error(
            "Équipe requise pour un collaborateur : " + parsed.error.issues[0].message,
          );
      }
      const { data: u, error: tErr } = await supabase
        .from("allowed_users")
        .update({ team: v.role === "collaborateur" ? v.team : null })
        .eq("id", v.id)
        .select("id");
      if (tErr) throw tErr;
      if (!u?.length) throw new Error("Modification refusée : vérifie que tu es admin");
      const { data: roleRows, error } = await supabase
        .from("allowed_user_roles")
        .update({ role: v.role, updated_at: new Date().toISOString() })
        .eq("allowed_user_id", v.id)
        .select("id");
      if (error)
        throw new Error(
          /dernier admin/i.test(error.message)
            ? "Impossible : c'est le dernier admin. Nomme d'abord un autre admin."
            : error.message,
        );
      if (!roleRows?.length) throw new Error("Modification refusée : vérifie que tu es admin");
      if (v.role !== "manager") {
        const { error: teamError } = await supabase
          .from("manager_teams")
          .delete()
          .eq("allowed_user_id", v.id);
        if (teamError) throw teamError;
      }
    },
    onSuccess: () => {
      toast.success("Rôle modifié");
      onChanged();
    },
    onError,
  });

  const setTeamFor = useMutation({
    mutationFn: async (v: { id: string; team: string }) => {
      const { error } = await supabase
        .from("allowed_users")
        .update({ team: v.team })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Équipe modifiée");
      onChanged();
    },
    onError,
  });

  const managerTeam = useMutation({
    mutationFn: async (v: { id: string; team: string; add: boolean }) => {
      const q = v.add
        ? supabase
            .from("manager_teams")
            .insert({ allowed_user_id: v.id, team: v.team })
            .select("id")
        : supabase
            .from("manager_teams")
            .delete()
            .eq("allowed_user_id", v.id)
            .eq("team", v.team)
            .select("id");
      const { data, error } = await q;
      if (error)
        throw new Error(
          error.code === "23505" ? `Ce manager a déjà l'équipe « ${v.team} ».` : error.message,
        );
      if (!data?.length) throw new Error("Modification refusée : vérifie que tu es admin");
    },
    onSuccess: () => {
      toast.success("Équipes du manager modifiées");
      onChanged();
    },
    onError,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(mail);
    if (!parsed.success) return setErr(parsed.error.issues[0].message);
    const fn = nameSchema.safeParse(firstName);
    const ln = nameSchema.safeParse(lastName);
    if (!fn.success || !fn.data) return setErr("Prénom requis");
    if (!ln.success || !ln.data) return setErr("Nom requis");
    if (role !== "admin" && !team)
      return setErr(role === "manager" ? "Choisis l'équipe du manager" : "Choisis l'équipe");
    setErr(null);
    add.mutate({
      email: parsed.data,
      role,
      team: role === "admin" ? null : team,
      first_name: fn.data,
      last_name: ln.data,
      invite: sendMail,
    });
  }

  const q = filter.trim().toLowerCase();
  const shown = users.filter(
    (u) =>
      !q ||
      `${userLabel(u)} ${u.email} ${u.team ?? ""} ${u.teams.join(" ")} ${ROLE_LABEL[u.role]}`
        .toLowerCase()
        .includes(q),
  );

  return (
    <div className="space-y-md">
      <form onSubmit={submit} className={`${card} space-y-sm`}>
        <h2 className="font-label-md text-label-md text-primary">AJOUTER UN UTILISATEUR</h2>
        <div className="flex flex-col md:flex-row flex-wrap gap-xs md:items-start">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Prénom"
            aria-label="Prénom"
            maxLength={100}
            className={field}
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Nom"
            aria-label="Nom"
            maxLength={100}
            className={field}
          />
          <input
            type="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            placeholder="prenom.nom@entreprise.com"
            aria-label="Adresse e-mail"
            className={`${field} flex-1 min-w-64`}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            aria-label="Rôle"
            className={field}
          >
            <option value="collaborateur">Collaborateur</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          {role !== "admin" && (
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              aria-label="Équipe"
              className={field}
            >
              <option value="">Choisir une équipe</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <button disabled={add.isPending} className={btnPrimary}>
            {add.isPending ? "…" : "AJOUTER"}
          </button>
        </div>
        <label className="flex items-center gap-xs font-body-sm">
          <input
            type="checkbox"
            checked={sendMail}
            onChange={(e) => setSendMail(e.target.checked)}
          />
          Envoyer une invitation par e-mail avec un lien de connexion
          <span className="text-on-surface-variant">
            (décoche pour le mode test : la personne est ajoutée sans e-mail)
          </span>
        </label>
        {err && <p className="text-error text-body-sm">{err}</p>}
      </form>

      <BulkImport onImported={onChanged} />

      <div className="flex flex-wrap items-center gap-sm">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Rechercher un nom, une équipe, un rôle…"
          aria-label="Rechercher un utilisateur"
          className={`${field} flex-1 min-w-64`}
        />
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          {shown.length} utilisateur{shown.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="border border-outline-variant divide-y divide-outline-variant bg-surface-container-lowest">
        {loading && <p className="p-sm">Chargement…</p>}
        {shown.map((u) => (
          <UserCard
            key={u.id}
            u={u}
            isMe={u.email === me}
            teams={teams}
            onRole={(next) => {
              if (next === "collaborateur") setRoleDialog({ user: u, team: u.team ?? "" });
              else changeRole.mutate({ id: u.id, role: next });
            }}
            onTeam={(t) => setTeamFor.mutate({ id: u.id, team: t })}
            onManagerTeam={(t, add) => managerTeam.mutate({ id: u.id, team: t, add })}
            onDelete={() => setToDelete(u)}
            onChanged={onChanged}
          />
        ))}
      </div>

      <Dialog open={!!roleDialog} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[32rem]">
          <DialogHeader>
            <DialogTitle>Équipe de {roleDialog && userLabel(roleDialog.user)}</DialogTitle>
            <DialogDescription>Un collaborateur appartient à une seule équipe.</DialogDescription>
          </DialogHeader>
          <select
            value={roleDialog?.team ?? ""}
            onChange={(e) => roleDialog && setRoleDialog({ ...roleDialog, team: e.target.value })}
            aria-label="Équipe du collaborateur"
            className={`w-full ${field}`}
          >
            <option value="">Choisir une équipe</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <DialogFooter>
            <button type="button" onClick={() => setRoleDialog(null)} className={btn}>
              Annuler
            </button>
            <button
              type="button"
              disabled={!roleDialog?.team || changeRole.isPending}
              onClick={() =>
                roleDialog &&
                changeRole.mutate(
                  { id: roleDialog.user.id, role: "collaborateur", team: roleDialog.team },
                  { onSuccess: () => setRoleDialog(null) },
                )
              }
              className={btnPrimary}
            >
              {changeRole.isPending ? "…" : "Enregistrer"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteUserDialog user={toDelete} onClose={() => setToDelete(null)} onDone={onChanged} />
    </div>
  );
}

function UserCard({
  u,
  isMe,
  teams,
  onRole,
  onTeam,
  onManagerTeam,
  onDelete,
  onChanged,
}: {
  u: UserRow;
  isMe: boolean;
  teams: string[];
  onRole: (r: AppRole) => void;
  onTeam: (t: string) => void;
  onManagerTeam: (t: string, add: boolean) => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [date, setDate] = useState(u.departure_date ?? "");
  const [team, setTeam] = useState(u.team ?? "");
  const [addTeam, setAddTeam] = useState("");
  const [exporting, setExporting] = useState(false);
  const state = departureState(u.departure_date);

  const setDeparture = useMutation({
    mutationFn: async (d: string | null) => {
      const { error } = await supabase
        .from("allowed_users")
        .update({ departure_date: d })
        .eq("id", u.id);
      if (error) throw error;
      return d;
    },
    onSuccess: (d) => {
      toast.success(d ? `Départ programmé le ${frDay(d)}` : "Départ annulé");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function exportData() {
    setExporting(true);
    try {
      await downloadUserExport(u);
      toast.success("Données téléchargées");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-sm p-sm">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="min-w-0">
          <p className="font-body-md font-bold text-primary wrap-anywhere">
            {userLabel(u)}
            {isMe && <span className="font-normal text-on-surface-variant"> (toi)</span>}
            {state !== "none" && (
              <span
                className={`ml-xs px-xs py-[1px] border font-label-sm text-label-sm ${
                  state === "overdue" || state === "week"
                    ? "border-error text-error"
                    : "border-outline text-on-surface-variant"
                }`}
              >
                {state === "overdue" ? "Parti le" : "Part le"} {frDay(u.departure_date!)}
              </span>
            )}
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant wrap-anywhere">
            {u.email} ·{" "}
            {u.role === "manager" ? u.teams.join(", ") || "Sans équipe" : (u.team ?? "Admin")}
          </p>
        </div>
        <div className="flex flex-wrap gap-xs items-center">
          <select
            value={u.role}
            onChange={(e) => onRole(e.target.value as AppRole)}
            aria-label={`Rôle de ${userLabel(u)}`}
            className={field}
          >
            <option value="collaborateur">Collaborateur</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button type="button" onClick={exportData} disabled={exporting} className={btn}>
            {exporting ? "…" : "EXPORTER SES DONNÉES"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isMe}
            title={isMe ? "Tu ne peux pas supprimer ton propre compte" : undefined}
            className={`${btn} text-error`}
          >
            SUPPRIMER
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-xs border-t border-outline-variant pt-sm">
        <label
          className="font-label-sm text-label-sm text-on-surface-variant"
          htmlFor={`dep-${u.id}`}
        >
          DÉPART PRÉVU LE
        </label>
        <input
          id={`dep-${u.id}`}
          type="date"
          min={todayYmd()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-outline-variant bg-surface px-sm py-1 font-body-md"
        />
        <button
          type="button"
          disabled={setDeparture.isPending || !date || date === u.departure_date}
          onClick={() => setDeparture.mutate(date)}
          className="bg-primary text-on-primary px-sm py-1 font-label-sm text-label-sm disabled:opacity-50"
        >
          Programmer
        </button>
        {u.departure_date && (
          <button
            type="button"
            disabled={setDeparture.isPending}
            onClick={() => {
              setDate("");
              setDeparture.mutate(null);
            }}
            className={btn}
          >
            Annuler le départ
          </button>
        )}
      </div>

      {u.role === "collaborateur" && (
        <div className="flex flex-wrap items-center gap-xs border-t border-outline-variant pt-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant">ÉQUIPE :</span>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            aria-label={`Équipe de ${userLabel(u)}`}
            className="border border-outline-variant bg-surface px-sm py-1 font-body-md"
          >
            <option value="">Choisir une équipe</option>
            {(u.team && !teams.includes(u.team) ? [u.team, ...teams] : teams).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!team || team === u.team}
            onClick={() => onTeam(team)}
            className="bg-primary text-on-primary px-sm py-1 font-label-sm text-label-sm disabled:opacity-50"
          >
            Enregistrer
          </button>
          {!u.team && <span className="text-error text-body-sm">Aucune équipe définie</span>}
        </div>
      )}
      {u.role === "manager" && (
        <div className="flex flex-wrap items-center gap-xs border-t border-outline-variant pt-sm">
          <span className="font-label-sm text-label-sm text-on-surface-variant">ÉQUIPES :</span>
          {u.teams.map((t) => (
            <button
              key={t}
              type="button"
              title={`Retirer l'équipe ${t}`}
              onClick={() => onManagerTeam(t, false)}
              className="border border-outline-variant bg-surface px-xs py-1 font-label-sm text-label-sm"
            >
              {t} ×
            </button>
          ))}
          <select
            value={addTeam}
            onChange={(e) => setAddTeam(e.target.value)}
            aria-label={`Ajouter une équipe à ${userLabel(u)}`}
            className="border border-outline-variant bg-surface px-sm py-1 font-body-md"
          >
            <option value="">Ajouter une équipe</option>
            {teams
              .filter((t) => !u.teams.includes(t))
              .map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!addTeam}
            onClick={() => {
              onManagerTeam(addTeam, true);
              setAddTeam("");
            }}
            className="bg-primary text-on-primary px-sm py-1 font-label-sm text-label-sm disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

function DeleteUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const close = () => {
    setConfirmed(false);
    setExported(false);
    onClose();
  };
  const del = useMutation({
    mutationFn: async () => deleteUser(user!.id),
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      onDone();
      close();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  async function exportData() {
    if (!user) return;
    setExporting(true);
    try {
      await downloadUserExport(user);
      setExported(true);
      toast.success("Données téléchargées");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Supprimer {user && userLabel(user)} ?</DialogTitle>
          <DialogDescription>Cette action est définitive.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-md space-y-xs font-body-sm text-on-surface-variant">
          <li>
            Sont supprimés : son profil, son compte de connexion, ses articles favoris et ses
            articles lus.
          </li>
          <li>
            Sont conservés mais anonymisés (« Ancien collaborateur ») : ses idées, commentaires et
            likes. Les idées validées et les articles liés restent en place.
          </li>
        </ul>
        <div className="space-y-xs">
          <p className="font-body-sm text-primary">
            Avant de supprimer, télécharge ses données (RGPD) pour les transférer ou les archiver.
          </p>
          <button type="button" onClick={exportData} disabled={exporting} className={btn}>
            {exporting ? "…" : exported ? "TÉLÉCHARGER À NOUVEAU" : "TÉLÉCHARGER SES DONNÉES"}
          </button>
        </div>
        <label className="flex items-start gap-xs font-body-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>
            {exported
              ? "Je confirme la suppression : les données ont été téléchargées."
              : "Je confirme la suppression sans avoir téléchargé ses données."}
          </span>
        </label>
        <DialogFooter>
          <button type="button" onClick={close} className={btn}>
            Annuler
          </button>
          <button
            type="button"
            disabled={!confirmed || del.isPending}
            onClick={() => del.mutate()}
            className="px-md py-xs bg-error text-on-primary font-label-md text-label-md disabled:opacity-50"
          >
            {del.isPending ? "…" : "Supprimer définitivement"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------
// Équipes
// ---------------------------------------------------------------------------------

function TeamsView({
  users,
  teams,
  onChanged,
}: {
  users: UserRow[];
  teams: { name: string; is_reserved: boolean }[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ideaCounts = useQuery({
    queryKey: ["idea_counts_by_team"],
    queryFn: fetchIdeaCountsByTeam,
  });
  const members = (t: string) =>
    users.filter(
      (u) =>
        (u.role === "collaborateur" && u.team === t) ||
        (u.role === "manager" && u.teams.includes(t)),
    ).length;
  const onError = (e: unknown) => toast.error((e as Error).message);

  const create = useMutation({
    mutationFn: async (n: string) => {
      const { error } = await supabase.from("teams").insert({ name: n });
      if (error)
        throw new Error(error.code === "23505" ? "Cette équipe existe déjà" : error.message);
    },
    onSuccess: () => {
      setName("");
      toast.success("Équipe créée");
      onChanged();
    },
    onError: (e) => setErr((e as Error).message),
  });
  const rename = useMutation({
    mutationFn: async (v: { from: string; to: string }) => {
      const { error } = await supabase.from("teams").update({ name: v.to }).eq("name", v.from);
      if (error)
        throw new Error(error.code === "23505" ? "Cette équipe existe déjà" : error.message);
    },
    onSuccess: () => {
      setEditing(null);
      toast.success("Équipe renommée");
      onChanged();
    },
    onError,
  });
  const del = useMutation({
    mutationFn: async (n: string) => {
      const { error } = await supabase.from("teams").delete().eq("name", n);
      if (error)
        throw new Error(
          error.code === "23503"
            ? "Impossible : cette équipe a encore des personnes, des idées ou des demandes."
            : error.message,
        );
    },
    onSuccess: () => {
      toast.success("Équipe supprimée");
      onChanged();
      ideaCounts.refetch();
    },
    onError,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = teamSchema.safeParse(name);
    if (!p.success) return setErr(p.error.issues[0].message);
    setErr(null);
    create.mutate(p.data);
  }

  return (
    <section className={`${card} space-y-sm`}>
      <h2 className="font-label-md text-label-md text-primary">ÉQUIPES</h2>
      <p className="font-body-sm text-on-surface-variant">
        Une équipe ne peut être supprimée que lorsqu'elle n'a plus de personnes ni d'idées.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-start gap-xs">
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nouvelle équipe"
            aria-label="Nouvelle équipe"
            maxLength={60}
            className={field}
          />
          {err && <p className="text-error text-body-sm mt-1">{err}</p>}
        </div>
        <button disabled={create.isPending} className={btnPrimary}>
          CRÉER
        </button>
      </form>
      <ul className="divide-y divide-outline-variant border border-outline-variant">
        {teams.map((t) => {
          const people = members(t.name);
          const ideas = ideaCounts.data?.[t.name] ?? 0;
          const blocked =
            people > 0
              ? `Encore ${people} personne(s) dans cette équipe`
              : ideas > 0
                ? `Cette équipe a ${ideas} idée(s)`
                : undefined;
          return (
            <li key={t.name} className="flex flex-wrap items-center justify-between gap-xs p-xs">
              {editing?.from === t.name ? (
                <span className="flex flex-wrap gap-xs">
                  <input
                    value={editing.to}
                    onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                    aria-label={`Nouveau nom pour ${t.name}`}
                    maxLength={60}
                    className="border border-outline-variant bg-surface px-sm py-1 font-body-md"
                  />
                  <button
                    type="button"
                    className="bg-primary text-on-primary px-sm py-1 font-label-sm text-label-sm"
                    disabled={rename.isPending}
                    onClick={() => {
                      const p = teamSchema.safeParse(editing.to);
                      if (!p.success) return toast.error(p.error.issues[0].message);
                      rename.mutate({ from: t.name, to: p.data });
                    }}
                  >
                    Enregistrer
                  </button>
                  <button type="button" className={btn} onClick={() => setEditing(null)}>
                    Annuler
                  </button>
                </span>
              ) : (
                <span className="font-body-md text-primary">
                  {t.is_reserved && (
                    <span aria-label="Équipe réservée" title="Équipe réservée" className="mr-xs">
                      🔒
                    </span>
                  )}
                  {t.name}{" "}
                  <span className="text-on-surface-variant text-body-sm">
                    · {people} personne(s) · {ideas} idée(s)
                  </span>
                </span>
              )}
              {!t.is_reserved && editing?.from !== t.name && (
                <span className="flex gap-xs">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => setEditing({ from: t.name, to: t.name })}
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    className={`${btn} text-error`}
                    disabled={del.isPending || !!blocked}
                    title={blocked}
                    onClick={() =>
                      confirm(`Supprimer l'équipe « ${t.name} » ?`) && del.mutate(t.name)
                    }
                  >
                    Supprimer
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------
// Départs
// ---------------------------------------------------------------------------------

function DeparturesView({
  me,
  users,
  pending,
  onChanged,
}: {
  me: string;
  users: UserRow[];
  pending: Awaited<ReturnType<typeof fetchDepartureRequests>>;
  onChanged: () => void;
}) {
  const [toDelete, setToDelete] = useState<UserRow | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const leaving = users
    .filter((u) => u.departure_date)
    .sort((a, b) => a.departure_date!.localeCompare(b.departure_date!));

  const decide = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => decideDepartureRequest(v.id, v.accept),
    onSuccess: (_, v) => {
      toast.success(v.accept ? "Départ programmé" : "Demande refusée");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("allowed_users")
        .update({ departure_date: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Départ annulé");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function exportData(u: UserRow) {
    setExportingId(u.id);
    try {
      await downloadUserExport(u);
      toast.success("Données téléchargées");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div className="space-y-md">
      <p className="font-body-sm text-on-surface-variant">
        Aucun départ n'entraîne de suppression ni de coupure automatique : à la date prévue, un
        admin supprime la personne manuellement.
      </p>

      <section className={`${card} space-y-sm`}>
        <h2 className="font-label-md text-label-md text-primary">
          DEMANDES DE DÉPART DES MANAGERS ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="text-body-sm text-on-surface-variant italic">Aucune demande en attente.</p>
        )}
        <ul className="divide-y divide-outline-variant">
          {pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-sm py-xs">
              <div className="min-w-0">
                <p className="font-body-md text-primary">
                  <strong>{r.user_label}</strong> · {r.team ?? "Sans équipe"} · départ le{" "}
                  {frDay(r.departure_date)}
                </p>
                <p className="font-label-sm text-label-sm text-on-surface-variant wrap-anywhere">
                  Signalé par {r.requested_by_name}
                  {r.comment ? ` — « ${r.comment} »` : ""}
                </p>
              </div>
              <div className="flex gap-xs">
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, accept: true })}
                  className={btnPrimary}
                >
                  VALIDER
                </button>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, accept: false })}
                  className={btn}
                >
                  REFUSER
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${card} space-y-sm`}>
        <h2 className="font-label-md text-label-md text-primary">
          DÉPARTS PROGRAMMÉS ({leaving.length})
        </h2>
        {leaving.length === 0 && (
          <p className="text-body-sm text-on-surface-variant italic">
            Aucun collaborateur n'a de départ programmé.
          </p>
        )}
        <ul className="divide-y divide-outline-variant">
          {leaving.map((u) => {
            const state = departureState(u.departure_date);
            return (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-sm py-xs">
                <div className="min-w-0">
                  <p className="font-body-md text-primary">
                    <strong>{userLabel(u)}</strong>{" "}
                    <span className="text-on-surface-variant">
                      · {u.role === "manager" ? u.teams.join(", ") : (u.team ?? "Admin")}
                    </span>
                  </p>
                  <p
                    className={`font-label-sm text-label-sm ${state === "overdue" || state === "week" ? "text-error" : "text-on-surface-variant"}`}
                  >
                    {state === "overdue"
                      ? `Départ le ${frDay(u.departure_date!)} : suppression à faire`
                      : state === "week"
                        ? `Part cette semaine, le ${frDay(u.departure_date!)}`
                        : `Part le ${frDay(u.departure_date!)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-xs">
                  <button
                    type="button"
                    disabled={exportingId === u.id}
                    onClick={() => exportData(u)}
                    className={btn}
                  >
                    {exportingId === u.id ? "…" : "EXPORTER SES DONNÉES"}
                  </button>
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(u.id)}
                    className={btn}
                  >
                    ANNULER LE DÉPART
                  </button>
                  <button
                    type="button"
                    disabled={u.email === me}
                    onClick={() => setToDelete(u)}
                    className={`${btn} text-error`}
                  >
                    SUPPRIMER
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <DeleteUserDialog user={toDelete} onClose={() => setToDelete(null)} onDone={onChanged} />
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------------

function AuditView() {
  const log = useQuery({ queryKey: ["admin_audit_log"], queryFn: fetchAuditLog, retry: false });
  const when = (iso: string) =>
    new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(iso),
    );
  return (
    <section className={`${card} space-y-sm`}>
      <h2 className="font-label-md text-label-md text-primary">JOURNAL DES ACTIONS ADMIN</h2>
      <p className="font-body-sm text-on-surface-variant">
        Changements de rôle, départs, suppressions, exports de données et gestion des équipes (200
        dernières actions).
      </p>
      {log.isLoading && <p className="text-body-sm">Chargement…</p>}
      {log.isError && <p className="text-body-sm text-error">Le journal est indisponible.</p>}
      {log.data?.length === 0 && (
        <p className="text-body-sm text-on-surface-variant italic">Aucune action enregistrée.</p>
      )}
      <ul className="divide-y divide-outline-variant border border-outline-variant">
        {log.data?.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-sm gap-y-0 p-xs">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {when(e.created_at)}
            </span>
            <span className="font-body-md text-primary">
              <strong>{e.action}</strong>
              {e.target ? ` · ${e.target}` : ""}
              {e.details ? ` (${e.details})` : ""}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              par {e.actor_name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
