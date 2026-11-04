import { useEffect } from "react";
import { createFileRoute, isRedirect, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchOwnRole } from "@/lib/auth";
import { trackPageView, trackedPageOf } from "@/lib/impact";

// Version élèves : un compte connecté sans rôle est envoyé vers /choisir-role
// (au lieu d'être déconnecté comme dans l'app d'origine, réservée à une liste blanche).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      const email = data.user.email ?? "";
      const role = email ? await fetchOwnRole(email) : null;
      if (!role) throw redirect({ to: "/choisir-role" });
      return { user: data.user, email, role };
    } catch (e) {
      if (isRedirect(e)) throw e;
      // Session périmée ou compte changé dans un autre onglet : retour propre à la connexion.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthenticatedLayout,
});

/** Compte une page vue à chaque arrivée sur Actus, Boîte à idées, Points bloquants ou Trombi. */
function AuthenticatedLayout() {
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    const page = trackedPageOf(pathname);
    if (page) void trackPageView(page);
  }, [pathname]);
  return <Outlet />;
}
