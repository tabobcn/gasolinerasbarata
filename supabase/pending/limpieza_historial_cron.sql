-- PENDIENTE (opcional): pegar una vez en el editor SQL del panel de Supabase.
--
-- pg_cron apunta cada ejecución en cron.job_run_details y nunca lo borra (unas 770 filas al día).
-- Esto programa una limpieza diaria que deja solo los últimos 7 días.
select cron.schedule(
  'limpiar-historial-cron',
  '15 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
