import { createFileRoute, redirect } from "@tanstack/react-router";

// La gestion des utilisateurs a déménagé dans l'onglet « Gestion des utilisateurs ».
export const Route = createFileRoute("/_authenticated/manage/users")({
  beforeLoad: () => {
    throw redirect({ to: "/utilisateurs" });
  },
});
