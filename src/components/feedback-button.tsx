import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { submitFeedback } from "@/lib/impact";

const QUESTION = "Happy Place t'aide-t-il au quotidien ?";

/** Bouton « Donner mon avis », fixé en bas à droite : note de 1 à 5 + commentaire libre, anonyme. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");

  const send = useMutation({
    mutationFn: () => submitFeedback(score, comment),
    onSuccess: () => {
      toast.success("Merci pour ton avis !");
      setOpen(false);
      setScore(0);
      setComment("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="fixed bottom-sm right-sm z-40 flex items-center gap-xs rounded border border-primary bg-primary px-md py-xs font-label-md text-label-md text-on-primary shadow-lg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Icon name="rate_review" /> DONNER MON AVIS
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed z-50 left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-sm border border-outline bg-surface-container-lowest p-md shadow-lg focus:outline-none">
          <div className="flex items-start justify-between gap-sm">
            <div>
              <DialogPrimitive.Title className="font-headline-sm text-headline-sm text-primary">
                Donne ton avis
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="font-label-sm text-label-sm text-on-surface-variant">
                Anonyme : ton nom n'est jamais associé à ta réponse.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fermer"
              className="text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" />
            </DialogPrimitive.Close>
          </div>
          <fieldset className="space-y-xs">
            <legend className="font-body-md font-bold text-primary">{QUESTION}</legend>
            <div className="flex items-center gap-xs" role="radiogroup" aria-label="Note de 1 à 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  onClick={() => setScore(n)}
                  className={`h-10 w-10 border font-label-md text-label-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    score === n
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant bg-card text-primary hover:bg-surface-container"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
              <span>1 · Pas du tout</span>
              <span>5 · Énormément</span>
            </p>
          </fieldset>
          <label className="block space-y-xs">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Un commentaire ? (facultatif)
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={4}
              className="w-full border border-outline-variant bg-card p-xs font-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Ce qui t'aide, ce qui manque, ce qui t'agace…"
            />
          </label>
          <div className="flex justify-end gap-xs">
            <DialogPrimitive.Close className="rounded border border-primary px-md py-xs font-label-md text-label-md text-primary hover:bg-surface-container">
              ANNULER
            </DialogPrimitive.Close>
            <button
              type="button"
              disabled={score === 0 || send.isPending}
              onClick={() => send.mutate()}
              className="rounded border border-primary bg-primary px-md py-xs font-label-md text-label-md text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              ENVOYER
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
