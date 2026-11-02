import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { BlockerArchive } from "@/components/dashboard-extras";
import { fetchBlockers, timeAgo, updateBlockerStatus } from "@/lib/dashboard";

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

function BlockersPage() {
  const qc = useQueryClient();
  const { role, email } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const [archiveOpen, setArchiveOpen] = useState(false);
  const blockers = useQuery({ queryKey: ["blockers"], queryFn: fetchBlockers, retry: false });
  const setBlocker = useMutation({
    mutationFn: updateBlockerStatus,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blockers"] }),
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <AppShell
      role={role}
      email={email}
      eyebrow="Suivi opérationnel"
      title="Points bloquants"
      actions={
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setArchiveOpen(true)}
          className="flex items-center gap-xs rounded px-md py-xs border border-primary bg-transparent text-primary font-label-md text-label-md hover:bg-surface-container"
        >
          <Icon name="inventory_2" /> VOIR L'ARCHIVE
        </button>
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
          {blockers.data?.map((b) => {
            const critical = b.severity === "critical";
            return (
              <div
                key={b.id}
                className={`${critical ? "accent-bar " : ""}bg-card border border-outline-variant rounded p-sm flex items-start justify-between gap-sm`}
              >
                <div className="flex gap-md min-w-0">
                  <Icon
                    name={critical ? "error" : "warning"}
                    className={
                      critical
                        ? "text-error mt-1 [font-variation-settings:'FILL'_1]"
                        : "text-secondary mt-1"
                    }
                  />
                  <div className="min-w-0">
                    <p className="font-body-md text-primary font-bold wrap-anywhere">{b.title}</p>
                    <p className="text-body-sm text-on-surface-variant wrap-anywhere">
                      {b.description}
                    </p>
                    <div className="flex items-center gap-sm mt-xs">
                      <span className="rounded text-[11px] font-label-sm bg-surface-container-highest px-xs py-0.5">
                        {b.department}
                      </span>
                      <span className="text-[11px] font-label-sm text-on-surface-variant">
                        Mis à jour {timeAgo(b.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <select
                  aria-label={`Statut de ${b.title}`}
                  value={b.status}
                  disabled={!isAdmin}
                  onChange={(e) => setBlocker.mutate({ id: b.id, status: e.target.value })}
                  className={`bg-transparent border-none text-xs font-label-sm focus:outline-none cursor-pointer ${critical ? "text-error" : "text-on-surface-variant"}`}
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
              </div>
            );
          })}
        </div>
      </section>
      <BlockerArchive open={archiveOpen} onClose={() => setArchiveOpen(false)} />
    </AppShell>
  );
}
