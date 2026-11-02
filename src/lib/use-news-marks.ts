import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchFavoriteIds, fetchReadCounts, fetchReadIds, setMark } from "@/lib/news-feed";

const KEYS = { news_favorites: ["news-favorites"], news_reads: ["news-reads"] } as const;

/** Favoris et « Lu » de la personne connectée, avec mise à jour immédiate puis annulation si erreur. */
export function useNewsMarks(isAdmin: boolean) {
  const qc = useQueryClient();
  const favs = useQuery({ queryKey: KEYS.news_favorites, queryFn: fetchFavoriteIds, retry: false });
  const reads = useQuery({ queryKey: KEYS.news_reads, queryFn: fetchReadIds, retry: false });
  const counts = useQuery({
    queryKey: ["news-read-counts"],
    queryFn: fetchReadCounts,
    enabled: isAdmin,
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: (v: { table: keyof typeof KEYS; id: string; on: boolean }) =>
      setMark(v.table, v.id, v.on),
    onMutate: async (v) => {
      const key = KEYS[v.table];
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<string[]>(key) ?? [];
      qc.setQueryData<string[]>(
        key,
        v.on ? [...before.filter((i) => i !== v.id), v.id] : before.filter((i) => i !== v.id),
      );
      return { before, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.before);
      toast.error("Action impossible pour le moment. Réessaie dans un instant.");
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: KEYS[v.table] });
      if (v.table === "news_reads") qc.invalidateQueries({ queryKey: ["news-read-counts"] });
    },
  });

  const favSet = new Set(favs.data ?? []);
  const readSet = new Set(reads.data ?? []);
  return {
    favs: favSet,
    reads: readSet,
    counts: counts.data ?? {},
    toggleFav: (id: string) => toggle.mutate({ table: "news_favorites", id, on: !favSet.has(id) }),
    toggleRead: (id: string) => toggle.mutate({ table: "news_reads", id, on: !readSet.has(id) }),
  };
}

export type NewsMarks = ReturnType<typeof useNewsMarks>;
