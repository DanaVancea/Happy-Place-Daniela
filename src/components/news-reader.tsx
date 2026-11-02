import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Icon } from "@/components/icon";
import { Linkify } from "@/components/linkify";
import { NewsImage, NewsLinks } from "@/components/news-media";
import { FavoriteButton, LevelBadge, NewsMeta, ReadButton } from "@/components/news-feed";
import type { News } from "@/lib/dashboard";
import type { NewsMarks } from "@/lib/use-news-marks";

/** Fenêtre de lecture d'une actualité (Échap ou clic sur le fond pour fermer). */
export function NewsReader({
  news: n,
  list,
  marks,
  onSelect,
  onClose,
}: {
  news: News | null;
  list: News[];
  marks: NewsMarks;
  onSelect: (n: News) => void;
  onClose: () => void;
}) {
  const i = n ? list.findIndex((x) => x.id === n.id) : -1;
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  return (
    <DialogPrimitive.Root open={!!n} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        {n && (
          <DialogPrimitive.Content className="fixed z-50 inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full md:w-[min(48rem,calc(100vw-2rem))] h-dvh md:h-auto md:max-h-[85vh] flex flex-col bg-surface-container-lowest border border-outline shadow-lg focus:outline-none">
            <div className="flex items-start justify-between gap-sm border-b border-outline-variant p-md">
              <div className="min-w-0 space-y-xs">
                <LevelBadge news={n} />
                <DialogPrimitive.Title className="font-headline-sm text-headline-sm text-primary wrap-anywhere">
                  {n.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description asChild>
                  <div>
                    <NewsMeta news={n} marks={marks} />
                  </div>
                </DialogPrimitive.Description>
              </div>
              <div className="flex items-center gap-xs shrink-0">
                <FavoriteButton id={n.id} marks={marks} />
                <DialogPrimitive.Close
                  aria-label="Fermer"
                  className="text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Icon name="close" />
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-md space-y-md">
              {n.image_path && <NewsImage path={n.image_path} alt={n.title} className="mx-auto max-w-xl" />}
              {n.summary && (
                <p className="font-body-md font-bold text-primary wrap-anywhere">{n.summary}</p>
              )}
              {n.body && (
                <p className="font-body-md text-body-md text-on-surface whitespace-pre-line wrap-anywhere">
                  <Linkify text={n.body} />
                </p>
              )}
              <NewsLinks links={n.links} />
            </div>
            <div className="flex items-center justify-between gap-sm border-t border-outline-variant p-md">
              <ReadButton id={n.id} marks={marks} />
              <div className="flex gap-xs">
                <button
                  type="button"
                  disabled={!prev}
                  onClick={() => prev && onSelect(prev)}
                  className="flex items-center gap-xs rounded border border-outline-variant px-sm py-xs font-label-sm text-label-sm disabled:opacity-40"
                >
                  <Icon name="chevron_left" /> Précédente
                </button>
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => next && onSelect(next)}
                  className="flex items-center gap-xs rounded border border-outline-variant px-sm py-xs font-label-sm text-label-sm disabled:opacity-40"
                >
                  Suivante <Icon name="chevron_right" />
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
