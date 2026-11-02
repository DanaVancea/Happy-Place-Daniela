import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import {
  deltaText,
  formatMetricValue,
  STATUS_LABELS,
  targetProgress,
  TREND_LABELS,
  trendIsGood,
  updateMetric,
  type Metric,
} from "@/lib/dashboard";
import { fetchMetricHistory, type MetricPoint } from "@/lib/news-feed";

const STALE_DAYS = 45;

export function metricLabel(m: Metric) {
  if (m.key === "training_kpi") return "Taux de placement";
  if (m.key === "active_users") return "Missions actives";
  return m.label;
}

export const STATUS_STYLE = {
  atteint: "bg-success text-on-primary",
  proche: "border border-outline text-primary",
  retard: "bg-error-container text-error",
} as const;

/** Cible, écart, barre d'avancement et statut d'un indicateur. */
function TargetLine({ m, large }: { m: Metric; large?: boolean }) {
  const p = targetProgress(m);
  if (!p) return null;
  return (
    <div className="space-y-0.5">
      <p
        className={`${large ? "text-body-sm" : "text-[11px]"} font-label-sm text-on-surface-variant`}
      >
        Cible :{" "}
        <span className="text-primary font-bold">{formatMetricValue(m.target!, m.unit)}</span>
      </p>
      <div
        className="h-1.5 rounded bg-surface-container-high"
        role="progressbar"
        aria-label="Avancement vers la cible"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.ratio * 100)}
      >
        <div className="h-full rounded bg-primary" style={{ width: `${p.ratio * 100}%` }} />
      </div>
      <span
        className={`inline-block whitespace-nowrap rounded px-xs py-0.5 text-[11px] font-label-sm ${STATUS_STYLE[p.status]}`}
      >
        {STATUS_LABELS[p.status]}
      </span>
    </div>
  );
}

const trendClass = (m: Metric) => {
  const good = trendIsGood(m);
  return good === false ? "text-error" : good ? "text-success" : "text-on-surface-variant";
};

const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Mini-courbe de tendance (purement visuelle : les valeurs sont lisibles dans le panneau). */
function Sparkline({ points }: { points: MetricPoint[] }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 28;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => 2 + (i / (points.length - 1)) * (W - 4);
  const y = (v: number) => 2 + (1 - (v - lo) / span) * (H - 4);
  const last = points.length - 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-7 text-primary"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
      />
      <circle cx={x(last)} cy={y(points[last].value)} r="2.5" fill="currentColor" />
    </svg>
  );
}

/** Tuile de l'encart « Indicateurs » : valeur, variation et date de mise à jour. */
export function MetricTile({
  metric: m,
  points,
  onOpen,
}: {
  metric: Metric;
  points?: MetricPoint[];
  onOpen: (m: Metric) => void;
}) {
  const age = daysSince(m.updated_at);
  const stale = age != null && age > STALE_DAYS;
  return (
    <button
      type="button"
      onClick={() => onOpen(m)}
      aria-haspopup="dialog"
      className="w-full text-left p-sm bg-card border border-outline-variant rounded min-w-0 hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <p className="font-label-sm text-label-sm text-on-surface-variant uppercase wrap-anywhere">
        {metricLabel(m)}
      </p>
      <p className="font-display text-[28px] leading-tight text-primary">
        {formatMetricValue(m.value, m.unit)}
      </p>
      <p className={`text-[11px] font-label-sm ${trendClass(m)}`}>
        {TREND_LABELS[m.trend]}
        {deltaText(m) && ` · ${deltaText(m)}`}
      </p>
      {points && <Sparkline points={points} />}
      <TargetLine m={m} />
      {m.updated_at && (
        <p
          className={`text-[11px] font-label-sm ${stale ? "text-error" : "text-on-surface-variant"}`}
        >
          {stale
            ? `Non mis à jour depuis ${age} jours`
            : `Mis à jour le ${shortDate(m.updated_at)}`}
        </p>
      )}
    </button>
  );
}

/** Courbe des 12 derniers mois (relevés réels uniquement, jamais de zéro inventé). */
function Chart({
  points,
  unit,
  target,
}: {
  points: MetricPoint[];
  unit: string | null;
  target?: number | null;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 520;
  const H = 220;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  const end = Date.now();
  const start = new Date();
  start.setMonth(start.getMonth() - 12);
  const t0 = start.getTime();
  const vals = points.map((p) => p.value).concat(target != null ? [Number(target)] : []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const min = lo - span * 0.2;
  const max = hi + span * 0.2;
  const x = (iso: string) =>
    pad.l + ((new Date(iso).getTime() - t0) / (end - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const months = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(t0 + ((end - t0) * i) / 4);
    return { d, left: pad.l + (i / 4) * (W - pad.l - pad.r) };
  });
  const a = active != null ? points[active] : null;
  return (
    <div className="space-y-xs">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Évolution sur 12 mois"
      >
        {[0, 0.5, 1].map((f) => {
          const v = min + (max - min) * f;
          return (
            <g key={f}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--outline-variant)"
                strokeWidth="1"
              />
              <text
                x={pad.l - 6}
                y={y(v) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--on-surface-variant)"
              >
                {formatMetricValue(Math.round(v * 10) / 10, unit)}
              </text>
            </g>
          );
        })}
        {months.map((m, i) => (
          <text
            key={i}
            x={m.left}
            y={H - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--on-surface-variant)"
          >
            {m.d.toLocaleDateString("fr-FR", { month: "short" })}
          </text>
        ))}
        {target != null && (
          <g>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(Number(target))}
              y2={y(Number(target))}
              stroke="var(--on-surface-variant)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <text
              x={W - pad.r}
              y={y(Number(target)) - 5}
              textAnchor="end"
              fontSize="11"
              fill="var(--on-surface-variant)"
            >
              Cible {formatMetricValue(Number(target), unit)}
            </text>
          </g>
        )}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            points={points.map((p) => `${x(p.recorded_at)},${y(p.value)}`).join(" ")}
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.recorded_at)}
            cy={y(p.value)}
            r={active === i ? 6 : 4}
            fill="var(--primary)"
            tabIndex={0}
            role="img"
            aria-label={`${shortDate(p.recorded_at)} : ${formatMetricValue(p.value, unit)}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="focus:outline-none"
          />
        ))}
      </svg>
      <p className="font-label-md text-label-md text-primary min-h-[1.5rem]" aria-live="polite">
        {a
          ? `${shortDate(a.recorded_at)} : ${formatMetricValue(a.value, unit)}`
          : "Survole ou sélectionne un point pour lire sa valeur."}
      </p>
    </div>
  );
}

/** Panneau latéral d'un indicateur : graphique, relevés et (Admin) mise à jour de la valeur. */
export function MetricPanel({
  metric: m,
  isAdmin,
  onClose,
}: {
  metric: Metric | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const history = useQuery({
    queryKey: ["metric-history", m?.key],
    queryFn: () => fetchMetricHistory(m!.key),
    enabled: !!m,
    retry: false,
  });
  const save = useMutation({
    mutationFn: updateMetric,
    onSuccess: () => {
      toast.success("Indicateur mis à jour");
      setDraft("");
      qc.invalidateQueries({ queryKey: ["metrics"] });
      qc.invalidateQueries({ queryKey: ["metrics-history-all"] });
      qc.invalidateQueries({ queryKey: ["metric-history", m?.key] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const points = history.data ?? [];
  const hasDemo = points.some((p) => p.is_demo);
  // Comparaisons : relevé précédent et relevé d'il y a environ 12 mois
  const compare: { label: string; value: number; delta: string; cls: string }[] = [];
  if (m && points.length > 1) {
    const cur = Number(m.value);
    const add = (label: string, p: MetricPoint | undefined) => {
      if (!p) return;
      const d = cur - p.value;
      const good = d === 0 ? null : (m.direction === "baisse") === d < 0;
      const abs = Math.abs(d).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      const suffix = m.unit === "%" ? " pts" : m.unit ? ` ${m.unit.trim()}` : "";
      compare.push({
        label,
        value: p.value,
        delta: d === 0 ? "Stable" : `${d > 0 ? "+" : "−"}${abs}${suffix}`,
        cls: good === false ? "text-error" : good ? "text-success" : "text-on-surface-variant",
      });
    };
    add("Mois précédent", points[points.length - 2]);
    add("Il y a 12 mois", points[0]);
  }
  return (
    <DialogPrimitive.Root open={!!m} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        {m && (
          <DialogPrimitive.Content className="fixed z-50 inset-y-0 right-0 w-full sm:w-[min(32rem,100vw)] flex flex-col bg-surface-container-lowest border-l border-outline shadow-lg focus:outline-none overflow-y-auto">
            <div className="flex items-start justify-between gap-sm border-b border-outline-variant p-md">
              <div className="min-w-0">
                <DialogPrimitive.Title className="font-headline-sm text-headline-sm text-primary wrap-anywhere">
                  {metricLabel(m)}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="font-label-sm text-label-sm text-on-surface-variant">
                  {m.updated_at
                    ? `Dernière mise à jour le ${shortDate(m.updated_at)}`
                    : "Date de mise à jour inconnue"}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Fermer"
                className="text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon name="close" />
              </DialogPrimitive.Close>
            </div>
            <div className="p-md space-y-md">
              <div>
                <p className="font-display text-[40px] leading-tight text-primary">
                  {formatMetricValue(m.value, m.unit)}
                </p>
                <p className={`font-label-sm text-label-sm ${trendClass(m)}`}>
                  {TREND_LABELS[m.trend]}
                  {deltaText(m) && ` · ${deltaText(m)}`}
                </p>
                <div className="mt-xs">
                  <TargetLine m={m} large />
                </div>
              </div>
              {m.definition && (
                <p className="text-body-sm text-on-surface border-l-2 border-accent-bar pl-sm">
                  {m.definition}
                </p>
              )}
              {compare.length > 0 && (
                <dl className="grid grid-cols-2 gap-sm">
                  {compare.map((c) => (
                    <div
                      key={c.label}
                      className="p-sm bg-card border border-outline-variant rounded"
                    >
                      <dt className="font-label-sm text-[11px] text-on-surface-variant uppercase">
                        {c.label}
                      </dt>
                      <dd className="font-label-md text-label-md text-primary">
                        {formatMetricValue(c.value, m.unit)}
                      </dd>
                      <dd className={`text-[11px] font-label-sm ${c.cls}`}>{c.delta}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <h3 className="font-label-md text-label-md text-on-surface-variant">
                12 DERNIERS MOIS
              </h3>
              {history.isLoading && (
                <p className="text-body-sm text-on-surface-variant">Chargement…</p>
              )}
              {history.isError && (
                <p className="text-body-sm text-error">L'historique est indisponible.</p>
              )}
              {history.data && points.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucun relevé sur les 12 derniers mois.
                </p>
              )}
              {hasDemo && (
                <p className="text-body-sm bg-tertiary-fixed text-primary rounded p-xs">
                  Données de démonstration : l'historique est fictif.
                </p>
              )}
              {points.length > 0 && <Chart points={points} unit={m.unit} target={m.target} />}
              {points.length > 0 && (
                <>
                  <p className="text-body-sm text-on-surface-variant">
                    {points.length === 1
                      ? "Un seul relevé pour l'instant : la courbe se construit à chaque mise à jour."
                      : `${points.length} relevés enregistrés.`}
                  </p>
                  <table className="w-full text-body-sm">
                    <caption className="sr-only">Relevés de {metricLabel(m)}</caption>
                    <thead>
                      <tr className="text-left font-label-sm text-label-sm text-on-surface-variant">
                        <th className="py-xs font-normal">Date</th>
                        <th className="py-xs font-normal text-right">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...points].reverse().map((p) => (
                        <tr key={p.recorded_at} className="border-t border-outline-variant">
                          <td className="py-xs">{shortDate(p.recorded_at)}</td>
                          <td className="py-xs text-right">{formatMetricValue(p.value, m.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {isAdmin && (
                <div className="space-y-xs border-t border-outline-variant pt-md">
                  <label
                    htmlFor="metric-value"
                    className="font-label-sm text-label-sm text-on-surface-variant block"
                  >
                    METTRE À JOUR LA VALEUR
                  </label>
                  <div className="flex gap-xs">
                    <input
                      id="metric-value"
                      type="number"
                      className="flex-grow min-w-0 bg-card border border-outline-variant rounded p-xs font-label-md focus:outline-none focus:border-primary"
                      value={draft !== "" ? draft : m.value}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={save.isPending || draft === ""}
                      onClick={() => save.mutate({ key: m.key, value: Number(draft) })}
                      className="rounded bg-primary text-on-primary px-sm font-label-md text-label-md disabled:opacity-50"
                    >
                      METTRE À JOUR
                    </button>
                  </div>
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
