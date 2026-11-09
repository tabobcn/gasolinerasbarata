-- Ya aplicado en el proyecto (10/11/2026). Se guarda como referencia.
--
-- Qué arregla: la web enseñaba una sola fecha ("actualizado el…") que era la más reciente de todo,
-- así que parecía al día aunque los precios llevaran días sin cargarse. Ahora hay dos fechas:
--   updated → último estado operativo recibido de REVE
--   prices  → inicio de la última pasada completa de tarifas

-- Fecha del estado de los puntos
create or replace function public.ev_last_sync()
returns timestamptz
language sql
stable security definer
set search_path to 'public'
as $function$
  select last_ok_at from ev_sync_state where resource = 'status';
$function$;

-- Fecha de los precios: todas las tarifas son al menos así de recientes.
-- Mientras no haya terminado ninguna pasada completa, la última página descargada.
create or replace function public.ev_last_prices()
returns timestamptz
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(full_at, last_ok_at) from ev_sync_state where resource = 'tariffs';
$function$;

grant execute on function public.ev_last_prices() to anon, authenticated;

-- Añade 'prices' a lo que devuelven las tres funciones de la web (no hace nada si ya lo tienen)
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('chargers_near', 'charger_detail', 'chargers_in_boxes')
  loop
    def := pg_get_functiondef(f.oid);
    if position('ev_last_prices()' in def) = 0 then
      def := replace(def, '''updated'', ev_last_sync(),', '''updated'', ev_last_sync(), ''prices'', ev_last_prices(),');
      execute def;
    end if;
  end loop;
end $$;
