import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/brand-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

// Deux façons d'entrer :
//  - par e-mail et mot de passe, réservé aux adresses déjà dans la liste des utilisateurs (nécessaire
//    pour recevoir les e-mails de Happy Place, par exemple quand le statut d'une idée change).
//    Première connexion ou mot de passe oublié : on envoie un lien à l'adresse, puis la personne
//    choisit son mot de passe ;
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
const primaryBtn = "h-12 w-full rounded-none font-label-md text-xs uppercase text-on-primary";
const secondaryBtn = "h-12 w-full rounded-none font-label-md text-xs uppercase";
const linkBtn =
  "font-label-sm text-label-sm uppercase text-primary underline-offset-2 hover:underline text-left";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mémorise, sur cet appareil, qu'un lien a été envoyé pour choisir un mot de passe :
// au retour du lien (souvent dans un autre onglet), on affiche le formulaire « Choisis ton mot de passe ».
const FLAG = "hp-choisir-mot-de-passe";
const flag = {
  get: () => {
    try {
      return localStorage.getItem(FLAG) === "1";
    } catch {
      return false;
    }
  },
  set: () => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      /* stockage indisponible : le formulaire ne s'affichera pas automatiquement */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(FLAG);
    } catch {
      /* rien */
    }
  },
};

/** Champ mot de passe avec un bouton pour afficher / masquer ce qui est saisi. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className={labelCls}>
        {label}
        <div className="relative">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            className={`${inputCls} pr-12`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Icon name={visible ? "visibility_off" : "visibility"} />
          </button>
        </div>
      </label>
    </div>
  );
}

type Mode = "login" | "lien" | "lien-envoye" | "mot-de-passe";

const db = supabase as unknown as SupabaseClient;

async function adresseDansLaListe(addr: string) {
  const { data, error } = await db.rpc("email_dans_la_liste", { _email: addr });
  if (error) throw new Error(`Impossible de vérifier l'adresse : ${error.message}`);
  return data === true;
}

const HORS_LISTE =
  "Cette adresse n'est pas dans la liste des utilisateurs. Demande à un admin de t'ajouter.";

function EntreePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);

  // Déjà connecté : on entre directement, sauf au retour du lien (choix du mot de passe).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (
        data.session &&
        flag.get() &&
        data.session.user.email &&
        !data.session.user.is_anonymous
      ) {
        setMode("mot-de-passe");
        setChecking(false);
      } else if (data.session) {
        navigate({ to: "/" });
      } else {
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr) || !password) {
      setError("Saisis ton adresse e-mail et ton mot de passe.");
      return;
    }
    setBusy(true);
    try {
      if (!(await adresseDansLaListe(addr))) {
        setError(HORS_LISTE);
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (err) {
        setError(
          /invalid login credentials/i.test(err.message)
            ? "Adresse ou mot de passe incorrect. Si c'est ta première connexion ou si tu as oublié ton mot de passe, utilise le lien ci-dessous."
            : `Connexion impossible : ${err.message}`,
        );
        return;
      }
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function envoyerLien(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) {
      setError("Saisis une adresse e-mail valide.");
      return;
    }
    setBusy(true);
    try {
      if (!(await adresseDansLaListe(addr))) {
        setError(HORS_LISTE);
        return;
      }
      const { error: err } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (err) {
        setError(`Impossible d'envoyer le lien : ${err.message}`);
        return;
      }
      flag.set();
      setMode("lien-envoye");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le lien.");
    } finally {
      setBusy(false);
    }
  }

  async function choisirMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Ton mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
      return;
    }
    if (password !== password2) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(`Impossible d'enregistrer le mot de passe : ${err.message}`);
      return;
    }
    flag.clear();
    navigate({ to: "/" });
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

  const emailField = (
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
  );

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
          ) : mode === "mot-de-passe" ? (
            <form onSubmit={choisirMotDePasse} className="mt-md space-y-sm" noValidate>
              <p className="font-body-md text-body-md text-on-surface">
                Choisis ton mot de passe. Tu l'utiliseras avec ton adresse e-mail pour te connecter.
              </p>
              <PasswordField
                label="Nouveau mot de passe"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirmer le mot de passe"
                value={password2}
                onChange={setPassword2}
                autoComplete="new-password"
              />
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {MIN_PASSWORD} caractères minimum.
              </p>
              <Button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? "ENREGISTREMENT…" : "ENREGISTRER ET ENTRER"}
              </Button>
            </form>
          ) : mode === "lien-envoye" ? (
            <div className="mt-md space-y-sm" role="status">
              <p className="font-body-md text-body-md text-on-surface">
                Un lien vient d'être envoyé à <strong>{email.trim().toLowerCase()}</strong>.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Ouvre-le sur cet appareil pour choisir ton mot de passe. Pense à regarder tes
                courriers indésirables.
              </p>
              <Button variant="outline" onClick={() => setMode("login")} className={secondaryBtn}>
                RETOUR À LA CONNEXION
              </Button>
            </div>
          ) : mode === "lien" ? (
            <form onSubmit={envoyerLien} className="mt-md space-y-sm" noValidate>
              <p className="font-body-md text-body-md text-on-surface">
                Première connexion ou mot de passe oublié : on t'envoie un lien pour choisir ton mot
                de passe.
              </p>
              {emailField}
              <Button type="submit" disabled={busy} className={primaryBtn}>
                {busy ? "ENVOI…" : "ENVOYER LE LIEN"}
              </Button>
              <button type="button" className={linkBtn} onClick={() => setMode("login")}>
                Retour à la connexion
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={login} className="mt-md space-y-sm" noValidate>
                {emailField}
                <PasswordField
                  label="Mot de passe"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
                <Button type="submit" disabled={busy} className={primaryBtn}>
                  {busy ? "CONNEXION…" : "ME CONNECTER"}
                </Button>
                <button type="button" className={linkBtn} onClick={() => setMode("lien")}>
                  Première connexion ou mot de passe oublié ?
                </button>
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
                className={secondaryBtn}
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
