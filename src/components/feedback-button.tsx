import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { submitFeedback } from "@/lib/impact";

/** Bouton « Donner mon avis », fixé en bas à droite : deux champs libres (ce qui plaît, ce qui peut s'améliorer), anonyme. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const filled = (t: string) => t.trim().length >= 3;

  const send = useMutation({
    mutationFn: () => submitFeedback(liked, improve),
    onSuccess: () => {
      toast.success("Merci pour ton avis !");
      setOpen(false);
      setLiked("");
      setImprove("");
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
                Aide-nous à améliorer Happy Place
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="font-label-sm text-label-sm text-on-surface-variant">
                Anonyme : ton nom n'est jamais associé à ta réponse. Un seul champ suffit.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fermer"
              className="text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" />
            </DialogPrimitive.Close>
          </div>
          <label className="block space-y-xs border border-outline-variant bg-card p-sm">
            <span className="font-body-md font-bold text-primary">Qu'est-ce que tu aimes ?</span>
            <textarea
              value={liked}
              onChange={(e) => setLiked(e.target.value)}
              maxLength={1000}
              rows={3}
              className="w-full border border-outline-variant bg-surface-container-lowest p-xs font-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Ce qui t'aide, ce qui te plaît…"
            />
          </label>
          <label className="block space-y-xs border border-outline-variant bg-card p-sm">
            <span className="font-body-md font-bold text-primary">
              Qu'est-ce que nous pouvons améliorer ?
            </span>
            <textarea
              value={improve}
              onChange={(e) => setImprove(e.target.value)}
              maxLength={1000}
              rows={3}
              className="w-full border border-outline-variant bg-surface-container-lowest p-xs font-body-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              placeholder="Une idée, une suggestion, un souci…"
            />
          </label>
          <div className="flex justify-end gap-xs">
            <DialogPrimitive.Close className="rounded border border-primary px-md py-xs font-label-md text-label-md text-primary hover:bg-surface-container">
              ANNULER
            </DialogPrimitive.Close>
            <button
              type="button"
              disabled={(!filled(liked) && !filled(improve)) || send.isPending}
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
