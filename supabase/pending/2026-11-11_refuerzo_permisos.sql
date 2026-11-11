-- Refuerzo de permisos y de chargers_in_boxes (revisión de seguridad del 11-11-2026).
-- Pegar en el editor SQL de Supabase y ejecutar una vez. No borra datos.

-- 1) Las tablas privadas ya estaban cerradas por RLS (sin políticas). Se quitan además los permisos de tabla.
revoke all on table public.ev_private, public.ev_req_log, public.ev_sync_state from anon, authenticated;

-- 2) Las tablas públicas son de solo lectura para la web: fuera los permisos de escritura (RLS ya los bloqueaba).
revoke insert, update, delete, truncate, references, trigger on table public.ev_locations, public.ev_evses, public.ev_tariffs from anon, authenticated;

-- 3) chargers_in_boxes: los puntos repetidos no multiplican el trabajo.
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.chargers_in_boxes(jsonb,double precision,integer)'::regprocedure) into d;
  n := replace(d, 'select (p->>0)::double precision as lat, (p->>1)::double precision as lon', 'select distinct (p->>0)::double precision as lat, (p->>1)::double precision as lon');
  if n = d and position('select distinct (p->>0)' in d) = 0 then
    raise exception 'chargers_in_boxes: no se ha encontrado el texto esperado';
  end if;
  execute n;
end $$;
