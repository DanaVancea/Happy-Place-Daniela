import { Icon } from "@/components/icon";
import { NewsImage } from "@/components/news-media";
import { formatExactDate } from "@/components/expandable-card";
import type { News } from "@/lib/dashboard";
import type { NewsMarks } from "@/lib/use-news-marks";
import {
  LEVEL_LABELS,
  highlightParts,
  isFresh,
  isScheduled,
  levelOf,
  publishedAt,
  readingMinutes,
} from "@/lib/news-feed";

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-secondary-fixed text-primary rounded-sm">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function LevelBadge({ news }: { news: News }) {
  const level = levelOf(news);
  if (level === "information") return null;
  return (
    <span
      className={`shrink-0 rounded px-xs font-label-sm text-label-sm uppercase ${
        level === "urgent"
          ? "bg-error-container text-error"
          : "bg-tertiary-fixed text-on-tertiary-fixed"
      }`}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

/** Étiquette de la ligne d'infos : « Clara · RH · il y a 3 jours · 2 min ». */
export function NewsMeta({ news, marks }: { news: News; marks: NewsMarks }) {
  const date = new Date(publishedAt(news)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <p className="font-label-sm text-label-sm text-on-surface-variant wrap-anywhere">
      {news.author}
      {news.department ? ` · ${news.department}` : ""} · {date} · {readingMinutes(news)} min
      {marks.counts[news.id] != null &&
        ` · ${marks.counts[news.id]} lecture${marks.counts[news.id] > 1 ? "s" : ""}`}
    </p>
  );
}

export function FavoriteButton({ id, marks }: { id: string; marks: NewsMarks }) {
  const on = marks.favs.has(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={(e) => {
        e.stopPropagation();
        marks.toggleFav(id);
      }}
      className="flex items-center rounded p-xs text-on-surface-variant hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Icon
        name="bookmark"
        className={on ? "text-primary [font-variation-settings:'FILL'_1]" : ""}
      />
    </button>
  );
}

export function ReadButton({ id, marks }: { id: string; marks: NewsMarks }) {
  const on = marks.reads.has(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        marks.toggleRead(id);
      }}
      className={`flex items-center gap-xs rounded border px-sm py-xs font-label-sm text-label-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        on
          ? "border-primary bg-primary text-on-primary"
          : "border-primary bg-transparent text-primary hover:bg-surface-container"
      }`}
    >
      <Icon name={on ? "check_circle" : "radio_button_unchecked"} />
      {on ? "Lu" : "Marquer comme lu"}
    </button>
  );
}

/** Carte d'une actualité. `hero` = grand format (à la une), sinon carte condensée sans image. */
export function NewsCard({
  news: n,
  marks,
  query,
  hero,
  onOpen,
}: {
  news: News;
  marks: NewsMarks;
  query: string;
  hero?: boolean;
  onOpen: (n: News) => void;
}) {
  const level = levelOf(n);
  const unread = !marks.reads.has(n.id) && isFresh(n) && !isScheduled(n);
  return (
    <article
      className={`relative bg-card border border-outline-variant rounded-lg min-w-0 flex flex-col ${
        level === "urgent" ? "accent-bar" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(n)}
        aria-haspopup="dialog"
        className={`flex-1 text-left min-w-0 rounded-lg p-md space-y-xs hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          hero ? "" : "pr-xl"
        }`}
      >
        {hero && n.image_path && <NewsImage path={n.image_path} alt="" className="mb-xs" />}
        <div className="flex flex-wrap items-center gap-xs">
          <LevelBadge news={n} />
          {unread && (
            <span className="rounded bg-surface-container-highest px-xs font-label-sm text-label-sm uppercase">
              Nouveau
            </span>
          )}
          {isScheduled(n) && (
            <span className="rounded border border-outline-variant px-xs font-label-sm text-label-sm uppercase">
              Programmée
            </span>
          )}
        </div>
        <h3
          className={`font-headline-sm text-primary wrap-anywhere ${hero ? "text-headline-sm" : "text-body-md font-bold"}`}
        >
          <Highlight text={n.title} query={query} />
        </h3>
        <p
          className={`font-body-md text-on-surface-variant wrap-anywhere ${hero ? "line-clamp-3" : "line-clamp-2"}`}
        >
          <Highlight text={n.summary || n.body || ""} query={query} />
        </p>
        <NewsMeta news={n} marks={marks} />
      </button>
      <div className="absolute right-xs top-xs">
        <FavoriteButton id={n.id} marks={marks} />
      </div>
      {hero && (
        <div className="flex items-center justify-between border-t border-outline-variant px-md py-xs">
          <ReadButton id={n.id} marks={marks} />
          <span
            className="font-label-sm text-label-sm text-on-surface-variant"
            title={formatExactDate(publishedAt(n))}
          >
            {marks.reads.has(n.id) ? "Déjà lu" : ""}
          </span>
        </div>
      )}
    </article>
  );
}
