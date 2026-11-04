import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/brand-header";
import { Button } from "@/components/ui/button";

// Deux façons d'entrer :
//  - par e-mail : on envoie un lien de connexion à une vraie adresse (nécessaire pour recevoir les
//    e-mails de Happy Place, par exemple quand le statut d'une idée change) ;
//  - sans e-mail (version élèves) : une session anonyme Supabase est ouverte, puis /choisir-role
//    donne une adresse interne fictive. Le navigateur garde la session.
// Dans les deux cas, /choisir-role permet de choisir son rôle à la première visite.

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Happy Place" },
      { name: "description", content: "Happy Place, le dashboard interne de Bigger Boat." },
    ],
  }),
  component: EntreePage,
});

const inputCls =
  "mt-xs h-11 w-full border border-outline-variant bg-background px-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const labelCls = "block font-label-sm text-label-sm uppercase text-on-surface-variant";

function EntreePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Déjà connecté (session gardée, ou retour du lien reçu par e-mail) : on entre directement.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate({ to: "/" });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError("Saisis une adresse e-mail valide.");
      return;
    }
    setBusy(true);
    // Seules les adresses déjà dans la liste des utilisateurs peuvent se connecter par e-mail.
    const { data: dansLaListe, error: listErr } = await (supabase as unknown as SupabaseClient).rpc(
      "email_dans_la_liste",
      {
        _email: addr,
      },
    );
    if (listErr) {
      setBusy(false);
      setError(`Impossible de vérifier l'adresse : ${listErr.message}`);
      return;
    }
    if (!dansLaListe) {
      setBusy(false);
      setError(
        "Cette adresse n'est pas dans la liste des utilisateurs. Demande à un admin de t'ajouter.",
      );
      return;
    }
    const { error: err } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setBusy(false);
    if (err) {
      setError(`Impossible d'envoyer le lien : ${err.message}`);
      return;
    }
    setSent(true);
  }

  async function enterWithoutEmail() {
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (err) {
      setError(
        /anonymous/i.test(err.message) && /disabled|not enabled/i.test(err.message)
          ? "Les connexions anonymes ne sont pas activées dans Supabase. Active « Allow anonymous sign-ins » (voir le README, étape 2), puis réessaie."
          : `Impossible d'ouvrir Happy Place : ${err.message}`,
      );
      return;
    }
    navigate({ to: "/choisir-role" });
  }

  return (
    <div className="min-h-dvh w-full bg-background flex flex-col">
      <BrandHeader />
      <main className="flex flex-1 items-center justify-center px-md py-lg">
        <section className="w-[min(100%,28rem)] border border-outline-variant bg-surface-container-lowest p-lg shadow-sm">
          <h1 className="font-headline-lg text-headline-lg text-primary">Happy Place</h1>
          {checking ? (
            <p className="mt-sm font-body-md text-body-md text-on-surface-variant" role="status">
              Ouverture de ton espace…
            </p>
          ) : sent ? (
            <div className="mt-md space-y-sm" role="status">
              <p className="font-body-md text-body-md text-on-surface">
                Un lien de connexion vient d'être envoyé à{" "}
                <strong>{email.trim().toLowerCase()}</strong>.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Ouvre-le sur cet appareil. Pense à regarder tes courriers indésirables.
              </p>
              <Button
                variant="outline"
                onClick={() => setSent(false)}
                className="h-11 w-full rounded-none font-label-md text-xs uppercase"
              >
                UTILISER UNE AUTRE ADRESSE
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={sendLink} className="mt-md space-y-sm" noValidate>
                <label className={labelCls}>
                  Mon adresse e-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={254}
                    className={inputCls}
                  />
                </label>
                <Button
                  type="submit"
                  disabled={busy}
                  className="h-12 w-full rounded-none font-label-md text-xs uppercase text-on-primary"
                >
                  {busy ? "ENVOI…" : "ME CONNECTER AVEC MON E-MAIL"}
                </Button>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Tu reçois un lien de connexion, sans mot de passe. C'est nécessaire pour recevoir
                  les e-mails de Happy Place.
                </p>
              </form>
              <div className="my-md flex items-center gap-sm" aria-hidden="true">
                <span className="h-px flex-1 bg-outline-variant" />
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                  ou
                </span>
                <span className="h-px flex-1 bg-outline-variant" />
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={enterWithoutEmail}
                className="h-12 w-full rounded-none font-label-md text-xs uppercase"
              >
                ENTRER SANS E-MAIL (TEST)
              </Button>
            </>
          )}
          {error && (
            <p
              className="mt-md border border-error bg-error-container p-sm font-body-sm text-on-error-container"
              role="alert"
            >
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
