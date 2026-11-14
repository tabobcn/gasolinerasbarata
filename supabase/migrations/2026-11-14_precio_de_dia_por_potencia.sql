-- Precio de energía de un conector cuando el operador cobra por horas o por potencia.
-- Antes se enseñaba el tramo más barato (el de noche). Ahora: de los tramos vigentes que corresponden a la
-- potencia del conector, el MÁS CARO (el de día). Si luego es más barato, mejor para el usuario.
-- No cambia ningún dato guardado: solo cómo se lee la tarifa que el propio operador declara a REVE.
-- Para volver atrás: quitar la llamada a ev_energy_price en ev_connectors_json (dejar 'e', t.energy_price).

CREATE OR REPLACE FUNCTION public.ev_energy_price(p_elements jsonb, p_kw numeric, p_fallback numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with el as (
    select e->'restrictions' r, e->'price_components' pcs
    from jsonb_array_elements(case when jsonb_typeof(p_elements) = 'array' then p_elements else '[]'::jsonb end) e
  ), cand as (
    select (pc->>'price')::numeric price, nullif(r->>'max_power', '')::numeric maxp
    from el, jsonb_array_elements(case when jsonb_typeof(pcs) = 'array' then pcs else '[]'::jsonb end) pc
    where pc->>'type' = 'ENERGY'
      and (pc->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
      and (pc->>'price')::numeric > 0
      and (r is null or jsonb_typeof(r) <> 'object' or (
            coalesce(r->>'reservation', '') = ''  -- lo que se cobra por reservar no es el precio de cargar
        and (coalesce(r->>'start_date', '') = '' or (r->>'start_date') <= to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD'))
        and (coalesce(r->>'end_date', '') = '' or (r->>'end_date') > to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD'))
        and (p_kw is null or coalesce(r->>'max_power', '') = '' or p_kw <= (r->>'max_power')::numeric)
        and (p_kw is null or coalesce(r->>'min_power', '') = '' or p_kw >= (r->>'min_power')::numeric)
      ))
  )
  select coalesce(
    (select max(price) from cand
      where not exists (select 1 from cand c2 where c2.maxp is not null)
         or maxp = (select min(maxp) from cand where maxp is not null)),
    p_fallback
  );
$function$;

-- Es una función de cálculo sin acceso a tablas; la usa ev_connectors_json, que se ejecuta con los permisos de quien llama.

CREATE OR REPLACE FUNCTION public.ev_connectors_json(p_connectors jsonb, p_full boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c->>'id', 's', c->>'standard', 'fmt', c->>'format', 'p', c->>'power_type', 'kw', (c->>'kw')::numeric,
      'e', ev_energy_price(t.elements, (c->>'kw')::numeric, t.energy_price), 'v', t.vat, 't', t.time_price_hour, 'f', t.flat_price, 'tu', t.updated_at
    ) || case when p_full then jsonb_build_object('el', t.elements, 'cur', t.currency) else '{}'::jsonb end
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_connectors, '[]'::jsonb)) c
  left join ev_tariffs t on t.connector_id = c->>'id';
$function$;
