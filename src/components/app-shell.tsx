import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrandHeader } from "@/components/brand-header";
import { Icon } from "@/components/icon";
import { signOut } from "@/lib/auth";
import { fetchSubmissions } from "@/lib/dashboard";

const TABS = [
  { to: "/", label: "Actualités", exact: true },
  { to: "/idees", label: "Idées", exact: false },
  { to: "/points-bloquants", label: "Points bloquants", exact: false },
  { to: "/trombi", label: "Trombi", exact: false },
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: "ADMIN",
  manager: "MANAGER",
  collaborateur: "COLLABORATEUR",
};

/** En-tête commun des pages : marque, onglets, titre de page et actions de session. */
export function AppShell({
  role,
  email,
  eyebrow,
  title,
  actions,
  children,
}: {
  role: string | null | undefined;
  email: string | null | undefined;
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const canReview = role === "admin" || role === "manager";
  // Idées en attente de réponse : visibles par les managers (leurs équipes) et les admins.
  const pending = useQuery({
    queryKey: ["submissions"],
    queryFn: fetchSubmissions,
    enabled: canReview,
    retry: false,
  });
  const pendingCount = canReview ? (pending.data?.length ?? 0) : 0;

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <nav
        aria-label="Sections"
        className="border-b border-outline-variant bg-surface-container-lowest"
      >
        <ul className="mx-auto flex w-full max-w-interface gap-xs overflow-x-auto px-sm md:px-md">
          {TABS.map((t) => (
            <li key={t.to}>
              <Link
                to={t.to}
                activeOptions={{ exact: t.exact }}
                className="flex items-center gap-xs whitespace-nowrap border-b-[3px] border-transparent px-sm py-sm font-body-md text-on-surface-variant hover:text-primary"
                activeProps={{ className: "border-secondary-fixed font-bold text-primary" }}
              >
                {t.label}
                {t.to === "/idees" && pendingCount > 0 && (
                  <span
                    className="rounded bg-tertiary-fixed px-xs font-label-sm text-label-sm text-on-tertiary-fixed"
                    aria-label={`${pendingCount} idée${pendingCount > 1 ? "s" : ""} à traiter`}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm mb-md">
          <div className="space-y-xs">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              {eyebrow}
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">{title}</h1>
          </div>
          <div className="flex flex-wrap gap-xs items-center md:items-end md:justify-end">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {email} · {ROLE_LABELS[role ?? ""] ?? ""}
            </span>
            {actions}
            {role === "admin" && (
              <Link
                to="/manage/news"
                className="flex items-center gap-xs rounded px-md py-xs border border-primary bg-transparent text-primary font-label-md text-label-md hover:bg-surface-container"
              >
                <Icon name="database" /> GÉRER LES DONNÉES
              </Link>
            )}
            <button
              onClick={() => signOut()}
              className="flex items-center gap-xs rounded px-md py-xs border border-primary bg-transparent text-primary font-label-md text-label-md hover:bg-surface-container"
            >
              <Icon name="logout" /> DÉCONNEXION
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
