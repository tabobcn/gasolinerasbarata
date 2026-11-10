-- Ya aplicado en el proyecto (10/11/2026). Se guarda como referencia.

-- 1) Coordenadas de todas las ubicaciones con cargador.
--    Lo usan las páginas de cargadores por ciudad y el sitemap para saber qué municipios tienen cargadores.
create or replace function public.ev_points()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_array(round(lat::numeric, 4), round(lon::numeric, 4))), '[]'::jsonb)
  from ev_locations
  where lat is not null and lon is not null;
$function$;

grant execute on function public.ev_points() to anon, authenticated;

-- 2) Suscripciones a avisos push (alertas de precio con la app cerrada).
--    Privada: RLS activado y sin políticas, así que solo entra la edge function "push" (clave de servicio).
--    No hay datos personales: la dirección push que genera el navegador, las alertas, los descuentos y las favoritas.
create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  alerts jsonb not null default '[]'::jsonb,
  discounts jsonb,
  favs jsonb not null default '[]'::jsonb,
  fav_fuels jsonb not null default '[]'::jsonb,
  state jsonb not null default '{}'::jsonb,   -- qué se ha avisado ya (para no repetir)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_at timestamptz,
  last_push_at timestamptz,
  last_status integer,                         -- respuesta del servicio push (201 = entregado)
  fails integer not null default 0,
  last_test timestamptz
);

alter table public.push_subs enable row level security;
revoke all on table public.push_subs from anon, authenticated;

-- 3) Comprobación de alertas cada media hora (la función no manda nada de 23:00 a 7:00)
select cron.schedule('push-check-cada-30-min', '7,37 * * * *', $cmd$ select net.http_post(
       url := 'https://qdutgibdyrrwwhpzvwja.supabase.co/functions/v1/push?action=check',
       headers := jsonb_build_object('Content-Type','application/json','x-sync-token',(select v from public.ev_private where k='sync_token')),
       body := '{}'::jsonb,
       timeout_milliseconds := 150000
     ); $cmd$);

-- Las claves del servidor de avisos (VAPID) las crea sola la función "push" la primera vez
-- y las guarda en ev_private (k = 'vapid'). No están en el código ni en Git.
