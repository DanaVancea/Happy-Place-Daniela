import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchDepartureRequests,
  fetchMyTeamMembers,
  frDay,
  reportDeparture,
  todayYmd,
} from "@/lib/users-admin";

export const Route = createFileRoute("/_authenticated/trombi")({
  head: () => ({
    meta: [
      { title: "Happy Place — Trombi" },
      { name: "description", content: "Retrouvez qui fait quoi dans chaque équipe." },
    ],
  }),
  component: DirectoryPage,
});

type Person = {
  first_name: string;
  last_name: string;
  team: string | null;
  role: "admin" | "manager" | "collaborateur";
  joined_at: string;
  managed_teams: string[];
};

const NEW_DAYS = 90;
const ROLE_LABELS: Record<Person["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  collaborateur: "Collaborateur",
};

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const frMonthYear = (iso: string) => {
  const t = new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const isNew = (p: Person) => Date.now() - new Date(p.joined_at).getTime() < NEW_DAYS * 864e5;

async function fetchDirectory(): Promise<Person[]> {
  const { data, error } = await supabase.rpc("team_directory");
  if (error) throw error;
  return (data ?? []) as Person[];
}

function DirectoryPage() {
  const { role, email } = Route.useRouteContext();
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [selected, setSelected] = useState<Person | null>(null);
  const directory = useQuery({
    queryKey: ["team_directory"],
    queryFn: fetchDirectory,
    retry: false,
  });

  const teams = useMemo(
    () =>
      [
        ...new Set((directory.data ?? []).map((p) => p.team).filter((t): t is string => !!t)),
      ].sort(),
    [directory.data],
  );
  const people = useMemo(() => {
    const q = normalize(query.trim());
    return (directory.data ?? []).filter(
      (p) =>
        (!team || p.team === team) &&
        (!onlyNew || isNew(p)) &&
        (!q ||
          normalize(
            `${p.first_name} ${p.last_name} ${p.team ?? ""} ${ROLE_LABELS[p.role]}`,
          ).includes(q)),
    );
  }, [directory.data, query, team, onlyNew]);

  // La fonction SQL `team_directory` est ajoutée par la migration 20261102090000_annuaire_trombi.sql.
  const missing =
    directory.isError &&
    /team_directory|PGRST202|42883/.test(JSON.stringify(directory.error ?? ""));

  return (
    <AppShell role={role} email={email} eyebrow="Annuaire" title="Trombi">
      {role === "manager" && <ReportDeparture />}
      <div className="flex flex-col md:flex-row gap-sm md:items-end">
        <div className="flex-1 space-y-xs">
          <label
            htmlFor="trombi-search"
            className="font-label-md text-label-md text-on-surface-variant block"
          >
            RECHERCHER
          </label>
          <input
            id="trombi-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, équipe, rôle…"
            className="w-full rounded border border-outline-variant bg-card p-xs font-body-md focus:border-primary focus:outline-none"
          />
        </div>
        <div className="space-y-xs md:w-64">
          <label
            htmlFor="trombi-team"
            className="font-label-md text-label-md text-on-surface-variant block"
          >
            ÉQUIPE
          </label>
          <select
            id="trombi-team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full rounded border border-outline-variant bg-card p-xs font-body-md focus:border-primary focus:outline-none"
          >
            <option value="">Toutes les équipes</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-xs pb-xs font-body-sm">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Nouvelles recrues (moins de 3 mois)
        </label>
      </div>

      {directory.isLoading && <p className="text-body-sm text-on-surface-variant">Chargement…</p>}
      {missing && (
        <p className="rounded bg-surface-container p-sm text-body-sm text-on-surface-variant">
          L'annuaire n'est pas encore activé sur la base de données. Il sera disponible après
          l'application de la migration « annuaire_trombi ».
        </p>
      )}
      {directory.isError && !missing && (
        <p className="text-body-sm text-error">L'annuaire est indisponible.</p>
      )}
      {directory.data && (
        <p className="font-label-sm text-label-sm text-on-surface-variant" aria-live="polite">
          {people.length} personne{people.length > 1 ? "s" : ""}
        </p>
      )}
      {directory.data && people.length === 0 && (
        <p className="text-body-sm text-on-surface-variant italic">
          Personne ne correspond à cette recherche.
        </p>
      )}
      <ul className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {people.map((p, i) => (
          <li key={`${i}-${p.first_name}-${p.last_name}-${p.team}`} className="min-w-0">
            <button
              type="button"
              onClick={() => setSelected(p)}
              className="flex w-full items-center gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm min-w-0 text-left hover:border-primary focus-visible:border-primary focus-visible:outline-none"
            >
              <div
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-fixed font-headline-sm text-headline-sm text-primary"
              >
                {p.first_name[0]}
                {p.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="font-body-md font-bold text-primary wrap-anywhere">
                  {p.first_name} {p.last_name}
                  {isNew(p) && (
                    <span className="ml-xs rounded bg-tertiary-fixed px-xs font-label-sm text-label-sm text-on-tertiary-fixed">
                      NOUVEAU·ELLE
                    </span>
                  )}
                </p>
                <p className="font-label-sm text-label-sm text-on-surface-variant wrap-anywhere">
                  {p.team ?? "Sans équipe"} · {ROLE_LABELS[p.role]}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <PersonDialog
        person={selected}
        directory={directory.data ?? []}
        onClose={() => setSelected(null)}
      />
    </AppShell>
  );
}

function PersonDialog({
  person,
  directory,
  onClose,
}: {
  person: Person | null;
  directory: Person[];
  onClose: () => void;
}) {
  const name = (p: Person) => `${p.first_name} ${p.last_name}`;
  const same = (a: Person, b: Person) =>
    a.first_name === b.first_name && a.last_name === b.last_name && a.team === b.team;
  const managers = person?.team
    ? directory.filter((p) => !same(p, person) && p.managed_teams.includes(person.team as string))
    : [];
  const mates = person?.team
    ? directory.filter((p) => !same(p, person) && p.team === person.team)
    : [];
  return (
    <Dialog open={!!person} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[32rem] max-h-[85vh] overflow-y-auto">
        {person && (
          <>
            <DialogHeader>
              <DialogTitle>{name(person)}</DialogTitle>
              <DialogDescription>
                {person.team ?? "Sans équipe"} · {ROLE_LABELS[person.role]}
              </DialogDescription>
            </DialogHeader>
            <dl className="space-y-sm text-body-sm">
              <div>
                <dt className="font-label-md text-label-md text-on-surface-variant">
                  DANS L'ENTREPRISE DEPUIS
                </dt>
                <dd className="font-body-md">{frMonthYear(person.joined_at)}</dd>
              </div>
              {person.managed_teams.length > 0 && (
                <div>
                  <dt className="font-label-md text-label-md text-on-surface-variant">MANAGE</dt>
                  <dd className="font-body-md">{person.managed_teams.join(", ")}</dd>
                </div>
              )}
              {person.role !== "admin" && (
                <div>
                  <dt className="font-label-md text-label-md text-on-surface-variant">
                    MANAGER{managers.length > 1 ? "S" : ""}
                  </dt>
                  <dd className="font-body-md">
                    {managers.length ? managers.map(name).join(", ") : "Aucun manager renseigné"}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-label-md text-label-md text-on-surface-variant">
                  AUTRES MEMBRES DE L'ÉQUIPE ({mates.length})
                </dt>
                <dd>
                  {mates.length ? (
                    <ul className="mt-xs max-h-48 space-y-xs overflow-y-auto">
                      {mates.map((m, i) => (
                        <li key={`${i}-${name(m)}`} className="font-body-md">
                          {name(m)}{" "}
                          <span className="font-label-sm text-label-sm text-on-surface-variant">
                            · {ROLE_LABELS[m.role]} · depuis {frMonthYear(m.joined_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="font-body-md italic text-on-surface-variant">
                      Personne d'autre dans cette équipe
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Un manager signale le départ d'un membre de son équipe : l'admin valide ou refuse la demande. */
function ReportDeparture() {
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["my_team_members"],
    queryFn: fetchMyTeamMembers,
    retry: false,
  });
  const requests = useQuery({
    queryKey: ["departure_requests", "mine"],
    queryFn: fetchDepartureRequests,
    retry: false,
  });
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  const send = useMutation({
    mutationFn: () => reportDeparture(userId, date, comment.trim()),
    onSuccess: () => {
      toast.success("Demande envoyée aux admins");
      setUserId("");
      setDate("");
      setComment("");
      qc.invalidateQueries({ queryKey: ["departure_requests"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (members.isError || !members.data?.length) return null;
  const open = (requests.data ?? []).filter((r) => r.status === "en attente");
  const decided = (requests.data ?? []).filter((r) => r.status !== "en attente").slice(0, 5);
  const field =
    "rounded border border-outline-variant bg-card p-xs font-body-md focus:border-primary focus:outline-none";
  return (
    <section className="space-y-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
      <h2 className="font-label-md text-label-md text-primary">SIGNALER UN DÉPART</h2>
      <p className="font-body-sm text-on-surface-variant">
        Un membre de ton équipe quitte l'entreprise ? Les admins valident la demande, puis
        s'occupent de la suppression de ses données.
      </p>
      <form
        className="flex flex-wrap items-end gap-xs"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          aria-label="Membre de l'équipe"
          className={field}
        >
          <option value="">Choisir un membre</option>
          {members.data.map((m) => (
            <option key={m.id} value={m.id}>
              {m.first_name} {m.last_name} · {m.team}
            </option>
          ))}
        </select>
        <input
          type="date"
          min={todayYmd()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date de départ"
          className={field}
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Commentaire (facultatif)"
          aria-label="Commentaire"
          maxLength={500}
          className={`${field} flex-1 min-w-48`}
        />
        <button
          disabled={!userId || !date || send.isPending}
          className="bg-primary px-md py-xs font-label-md text-label-md text-on-primary disabled:opacity-50"
        >
          {send.isPending ? "…" : "SIGNALER"}
        </button>
      </form>
      {(open.length > 0 || decided.length > 0) && (
        <ul className="space-y-xs font-body-sm text-on-surface-variant">
          {[...open, ...decided].map((r) => (
            <li key={r.id}>
              {r.user_label} · départ le {frDay(r.departure_date)} ·{" "}
              <strong className="text-primary">{r.status}</strong>
              {r.status === "refusée" && r.decision_reason ? ` — motif : ${r.decision_reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
