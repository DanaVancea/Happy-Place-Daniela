import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import {
  PAGE_LABEL,
  downloadCsv,
  feedbackToCsv,
  fetchFeedbackRows,
  fetchImpact,
  monthLabel,
  pct,
  weekLabel,
  type ImpactData,
} from "@/lib/impact";

export const Route = createFileRoute("/_authenticated/impact")({
  head: () => ({
    meta: [
      { title: "Happy Place — Impact" },
      {
        name: "description",
        content:
          "Espace admin : usage de l'application, idées par équipe et avis des collaborateurs.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (context.role !== "admin") throw redirect({ to: "/" });
  },
  component: ImpactPage,
});

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
] as const;

/** Barres horizontales sobres : couleur unie, valeur écrite (jamais la couleur seule). */
function Bars({
  rows,
  max,
  unit = "",
}: {
  rows: { label: string; value: number; hint?: string }[];
  max?: number;
  unit?: string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-xs">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-xs">
          <span className="truncate font-body-sm text-on-surface-variant">{r.label}</span>
          <span className="h-3 bg-surface-container-high">
            <span className="block h-3 bg-primary" style={{ width: `${(r.value / top) * 100}%` }} />
          </span>
          <span className="font-label-md text-label-md text-primary">
            {r.value}
            {unit}
            {r.hint ? <span className="text-on-surface-variant"> {r.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-sm border border-outline-variant bg-card p-md">
      <div>
        <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
        {hint && <p className="font-label-sm text-label-sm text-on-surface-variant">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-outline-variant bg-card p-md">
      <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">{label}</p>
      <p className="font-headline-lg text-headline-lg text-primary">{value}</p>
      <p className="font-body-sm text-on-surface-variant">{sub}</p>
    </div>
  );
}

function ImpactPage() {
  const { role, email } = Route.useRouteContext();
  const [days, setDays] = useState<number>(30);
  const q = useQuery({
    queryKey: ["impact", days],
    queryFn: () => fetchImpact(days),
    retry: false,
  });
  const d = q.data;

  const exportCsv = useMutation({
    mutationFn: fetchFeedbackRows,
    onSuccess: (rows) => {
      if (rows.length === 0) return toast.info("Aucun avis à exporter pour l'instant");
      downloadCsv(
        `avis-happy-place-${new Date().toISOString().slice(0, 10)}.csv`,
        feedbackToCsv(rows),
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AppShell role={role} email={email} eyebrow="Espace admin" title="Impact">
      {q.isLoading && <p className="text-body-sm text-on-surface-variant">Chargement…</p>}
      {q.isError && (
        <p className="text-body-sm text-error">
          Les indicateurs sont indisponibles : la migration « impact_et_feedback » est-elle
          appliquée ?
        </p>
      )}
      {d && (
        <Content
          d={d}
          days={days}
          setDays={setDays}
          onExport={() => exportCsv.mutate()}
          exporting={exportCsv.isPending}
        />
      )}
    </AppShell>
  );
}

function Content({
  d,
  days,
  setDays,
  onExport,
  exporting,
}: {
  d: ImpactData;
  days: number;
  setDays: (n: number) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const [view, setView] = useState<"semaine" | "mois">("semaine");
  const activeRows =
    view === "semaine"
      ? [...d.weekly].reverse().map((w) => ({
          label: weekLabel(w.start),
          value: w.active,
          hint: `/ ${w.connected} connectés`,
        }))
      : [...d.monthly].reverse().map((m) => ({
          label: monthLabel(m.start),
          value: m.active,
          hint: `/ ${m.connected} connectés`,
        }));
  const last = d.team_participation[d.team_participation.length - 1];
  const months = useMemo(
    () => d.team_participation.map((m) => m.start).reverse(),
    [d.team_participation],
  );
  const ideasByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of d.ideas_monthly) map.set(`${r.month}|${r.team}`, r.count);
    const totals = new Map<string, number>();
    for (const r of d.ideas_monthly) totals.set(r.team, (totals.get(r.team) ?? 0) + r.count);
    // Seulement les équipes qui ont réellement déposé des idées, les plus actives d'abord.
    const teams = [...totals.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
    return { map, teams };
  }, [d]);
  const ideasPerMonth = months.map((m) => ({
    label: monthLabel(m),
    value: d.ideas_monthly.filter((r) => r.month === m).reduce((s, r) => s + r.count, 0),
  }));

  return (
    <>
      <div className="grid gap-sm md:grid-cols-4">
        <Kpi
          label="Actifs sur 7 jours"
          value={`${pct(d.wau, d.total_users)} %`}
          sub={`${d.wau} sur ${d.total_users} · connectés : ${d.wau_connected}`}
        />
        <Kpi
          label="Actifs sur 30 jours"
          value={`${pct(d.mau, d.total_users)} %`}
          sub={`${d.mau} sur ${d.total_users} · connectés : ${d.mau_connected}`}
        />
        <Kpi
          label="Équipes qui déposent des idées"
          value={`${pct(last?.teams_with_ideas ?? 0, d.teams_total)} %`}
          sub={`${last?.teams_with_ideas ?? 0} sur ${d.teams_total} équipes ce mois-ci`}
        />
        <Kpi
          label="Avis reçus"
          value={String(d.feedback.responses)}
          sub={`dont ${d.feedback.this_month} ce mois-ci`}
        />
      </div>
      <p className="font-body-sm text-on-surface-variant">
        « Connecté » : a consulté au moins une page suivie ou fait une action. « Actif » : a fait
        une action (idée, vote, commentaire, point bloquant, « Lu » ou favori d'une actualité, avis)
        ; ouvrir l'application ne suffit pas. Les pourcentages sont rapportés à tous les comptes
        (collaborateurs, managers et admins) dont le départ n'est pas passé.
      </p>

      <Card
        title={view === "semaine" ? "Actifs par semaine" : "Actifs par mois"}
        hint={
          view === "semaine"
            ? "8 dernières semaines, la plus récente en haut (début de semaine)"
            : "6 derniers mois, le plus récent en haut"
        }
      >
        <div className="flex flex-wrap gap-xs" role="group" aria-label="Vue">
          {(["semaine", "mois"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded border px-sm py-xs font-label-md text-label-md ${
                view === v
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant text-primary hover:bg-surface-container"
              }`}
            >
              {v === "semaine" ? "Par semaine" : "Par mois"}
            </button>
          ))}
        </div>
        <Bars rows={activeRows} max={Math.max(1, d.total_users)} />
      </Card>

      <Card
        title="Pages les plus consultées"
        hint={
          d.pages_since
            ? `Suivi depuis le ${d.pages_since.split("-").reverse().join("/")} · une page vue par arrivée sur la page`
            : "Le suivi démarre à la mise en ligne : pas encore de données."
        }
      >
        <div className="flex flex-wrap gap-xs" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
              className={`rounded border px-sm py-xs font-label-md text-label-md ${
                days === p.days
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant text-primary hover:bg-surface-container"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {d.pages.length === 0 ? (
          <p className="font-body-sm italic text-on-surface-variant">
            Aucune page vue sur cette période.
          </p>
        ) : (
          <Bars
            rows={d.pages.map((p) => ({
              label: PAGE_LABEL[p.page] ?? p.page,
              value: p.views,
              hint: `(${p.visitors} pers.)`,
            }))}
          />
        )}
      </Card>

      <Card
        title="Idées déposées"
        hint="6 derniers mois, le plus récent en haut · seulement les équipes qui ont déposé des idées"
      >
        <Bars rows={ideasPerMonth} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-body-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left font-label-sm text-label-sm uppercase text-on-surface-variant">
                <th className="py-xs pr-sm">Équipe</th>
                {months.map((m) => (
                  <th key={m} className="px-xs py-xs text-right">
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ideasByTeam.teams.map((t) => (
                <tr key={t} className="border-b border-outline-variant">
                  <td className="py-xs pr-sm">{t}</td>
                  {months.map((m) => {
                    const n = ideasByTeam.map.get(`${m}|${t}`) ?? 0;
                    return (
                      <td
                        key={m}
                        className={`px-xs py-xs text-right ${n === 0 ? "text-on-surface-variant" : "font-bold text-primary"}`}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="font-body-sm text-on-surface-variant">
          Équipes avec au moins une idée :{" "}
          {[...d.team_participation]
            .reverse()
            .map((m) => `${monthLabel(m.start)} ${pct(m.teams_with_ideas, d.teams_total)} %`)
            .join(" · ")}
        </p>
      </Card>

      <Card
        title="Avis des collaborateurs"
        hint="Texte libre, anonyme : aucun nom n'est associé à un avis"
      >
        <Bars
          rows={d.feedback.monthly.map((m) => ({ label: monthLabel(m.start), value: m.count }))}
        />
        <FeedbackList />
        <div>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-xs rounded border border-primary px-md py-xs font-label-md text-label-md text-primary hover:bg-surface-container disabled:opacity-50"
          >
            <Icon name="download" /> EXPORTER LES AVIS (CSV)
          </button>
        </div>
      </Card>
    </>
  );
}

/** Derniers avis, les plus récents d'abord (lecture réservée aux admins par RLS). */
function FeedbackList() {
  const q = useQuery({ queryKey: ["feedback_rows"], queryFn: fetchFeedbackRows, retry: false });
  const rows = (q.data ?? []).slice(0, 30);
  if (q.isLoading) return <p className="font-body-sm text-on-surface-variant">Chargement…</p>;
  if (rows.length === 0) {
    return (
      <p className="font-body-sm italic text-on-surface-variant">Aucun avis pour l'instant.</p>
    );
  }
  return (
    <ul className="max-h-96 space-y-xs overflow-y-auto">
      {rows.map((r, i) => (
        <li key={i} className="border border-outline-variant bg-surface-container-lowest p-sm">
          <p className="font-body-md whitespace-pre-line wrap-anywhere">{r.comment}</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {monthLabel(r.period)}
            {r.team ? ` · ${r.team}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
