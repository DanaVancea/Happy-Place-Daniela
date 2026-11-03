import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";

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
  validated_ideas?: number;
};

const NEW_DAYS = 90;
const ROLE_LABELS: Record<Person["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  collaborateur: "Collaborateur",
};

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
        {people.map((p) => (
          <li
            key={`${p.first_name}-${p.last_name}-${p.team}`}
            className="flex items-center gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm min-w-0"
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
                {Number(p.validated_ideas ?? 0) > 0 && (
                  <span
                    className="ml-xs rounded bg-success px-xs font-label-sm text-label-sm text-on-primary"
                    title="A proposé une idée validée par son manager"
                  >
                    {Number(p.validated_ideas) > 1
                      ? `${p.validated_ideas} IDÉES VALIDÉES`
                      : "IDÉE VALIDÉE"}
                  </span>
                )}
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
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
