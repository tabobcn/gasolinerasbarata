-- Copia de referencia de las funciones que la web llama con la clave pública y que no estaban en el repositorio.
-- Leídas de la base de datos el 11-11-2026 con pg_get_functiondef. NO hace falta ejecutarlas: ya están aplicadas.

CREATE OR REPLACE FUNCTION public.charger_detail(p_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'updated', ev_last_sync(), 'prices', ev_last_prices(),
    'item', jsonb_build_object(
      'id', l.id, 'name', l.name, 'address', l.address, 'city', l.city, 'cp', l.postal_code,
      'operator', l.operator, 'party', l.party_id, 'owner', l.owner,
      'lat', l.lat, 'lon', l.lon, 'h24', l.twentyfourseven, 'opening', l.opening,
      'parking', l.parking_type, 'facilities', l.facilities,
      'updated', l.updated_at, 'synced', l.synced_at,
      'evses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'evse_id', e.evse_id, 'op', e.operational, 'opu', e.operational_updated,
          'st', e.status, 'stu', e.status_updated, 'chk', e.status_checked, 'kw', e.max_kw,
          'cap', e.capabilities, 'floor', e.floor_level, 'ref', e.physical_reference,
          'c', ev_connectors_json(e.connectors, true)
        ) order by e.evse_id), '[]'::jsonb)
        from ev_evses e where e.location_id = l.id
      )
    )
  )
  from ev_locations l where l.id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.chargers_near(p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 5, p_limit integer DEFAULT 80)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with prm as (
    select least(greatest(coalesce(p_radius_km, 5), 0.5), 30) as r, least(greatest(coalesce(p_limit, 80), 1), 150) as lim
  ), box as (
    select r, lim, r / 111.0 as dlat, r / (111.0 * cos(radians(p_lat))) as dlon from prm
  ), near as (
    select l.*,
      6371 * 2 * asin(sqrt(power(sin(radians(l.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(l.lat)) * power(sin(radians(l.lon - p_lon) / 2), 2))) as dist
    from ev_locations l, box
    where l.lat between p_lat - box.dlat and p_lat + box.dlat
      and l.lon between p_lon - box.dlon and p_lon + box.dlon
  ), top as (
    select n.* from near n, box where n.dist <= box.r order by n.dist limit (select lim from box)
  )
  select jsonb_build_object(
    'updated', ev_last_sync(), 'prices', ev_last_prices(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'address', t.address, 'city', t.city,
        'operator', t.operator, 'party', t.party_id,
        'lat', t.lat, 'lon', t.lon, 'dist', round(t.dist::numeric, 2),
        'h24', t.twentyfourseven, 'updated', t.updated_at,
        'evses', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'op', e.operational, 'st', e.status, 'stu', e.status_updated, 'chk', e.status_checked, 'kw', e.max_kw,
            'c', ev_connectors_json(e.connectors)
          ) order by e.evse_id), '[]'::jsonb)
          from ev_evses e where e.location_id = t.id
        )
      ) order by t.dist)
      from top t
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ev_connectors_json(p_connectors jsonb, p_full boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c->>'id', 's', c->>'standard', 'fmt', c->>'format', 'p', c->>'power_type', 'kw', (c->>'kw')::numeric,
      'e', t.energy_price, 'v', t.vat, 't', t.time_price_hour, 'f', t.flat_price, 'tu', t.updated_at
    ) || case when p_full then jsonb_build_object('el', t.elements, 'cur', t.currency) else '{}'::jsonb end
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_connectors, '[]'::jsonb)) c
  left join ev_tariffs t on t.connector_id = c->>'id';
$function$
;
