import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import {
  finishOnboarding,
  ONBOARDING_EVENT,
  shouldShowOnboarding,
  stepsForRole,
} from "@/lib/onboarding";

/**
 * Parcours d'accueil en 4 écrans : s'ouvre seul à la première connexion (état stocké en base),
 * se relance depuis le lien « Aide », et peut être passé à tout moment.
 */
export function OnboardingTour({
  userId,
  role,
}: {
  userId: string;
  role: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // Un relancement manuel ne doit pas réécrire l'état en base.
  const [firstTime, setFirstTime] = useState(false);
  const steps = stepsForRole(role);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  useEffect(() => {
    let cancelled = false;
    shouldShowOnboarding(userId).then((show) => {
      if (cancelled || !show) return;
      setFirstTime(true);
      setStep(0);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const relaunch = () => {
      setFirstTime(false);
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_EVENT, relaunch);
    return () => window.removeEventListener(ONBOARDING_EVENT, relaunch);
  }, []);

  const close = (skipped: boolean) => {
    setOpen(false);
    if (firstTime) {
      setFirstTime(false);
      void finishOnboarding(skipped).catch(() => {});
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close(!isLast)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed z-50 left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 space-y-md border border-outline bg-surface-container-lowest p-md shadow-lg focus:outline-none">
          <div className="flex items-center justify-between gap-sm">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Bienvenue · étape {step + 1} sur {steps.length}
            </p>
            <button
              type="button"
              onClick={() => close(true)}
              className="font-label-md text-label-md text-primary underline underline-offset-2 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Passer
            </button>
          </div>

          <div
            className="flex gap-xs"
            role="progressbar"
            aria-label="Progression"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={step + 1}
          >
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 ${i <= step ? "bg-primary" : "bg-surface-container-highest"}`}
              />
            ))}
          </div>

          <div className="space-y-sm">
            <div className="flex items-center gap-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-secondary-fixed text-primary">
                <Icon name={current.icon} />
              </span>
              <DialogPrimitive.Title className="font-headline-sm text-headline-sm text-primary">
                {current.title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Description className="font-body-md text-on-surface-variant">
              {current.intro}
            </DialogPrimitive.Description>
            <ul className="list-disc space-y-xs pl-md font-body-md text-on-surface">
              {current.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-sm">
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="rounded border border-primary bg-transparent px-md py-xs font-label-md text-label-md text-primary hover:bg-surface-container disabled:invisible focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              PRÉCÉDENT
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => (isLast ? close(false) : setStep((s) => s + 1))}
              className="rounded border border-primary bg-primary px-md py-xs font-label-md text-label-md text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {isLast ? "C'EST PARTI" : "SUIVANT"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
