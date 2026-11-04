-- ============================================================
-- Synchronisation des indicateurs : toutes les 5 minutes (au lieu de toutes les heures)
-- ============================================================
-- cron.schedule avec un nom existant remplace la planification précédente.
-- Limite : Google met lui-même en cache le CSV « publié sur le web » environ 5 minutes,
-- inutile donc de descendre en dessous. La fonction n'écrit que les valeurs qui changent.

SELECT cron.schedule('synchro-indicateurs', '*/5 * * * *', $$SELECT private.sync_metrics_from_csv()$$);
