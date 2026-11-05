-- Estado de sincronización: reintentos con espera, último éxito y última pasada completa
alter table ev_sync_state add column if not exists errors int not null default 0;
alter table ev_sync_state add column if not exists retry_at timestamptz;
alter table ev_sync_state add column if not exists last_ok_at timestamptz;
alter table ev_sync_state add column if not exists full_at timestamptz;
update ev_sync_state set last_ok_at = updated_at where resource in ('locations', 'tariffs', 'status') and last_error is null and last_ok_at is null;
update ev_sync_state set full_at = now() where resource = 'locations' and full_at is null;

-- Bloqueo para no preguntar dos veces a la vez por el mismo punto
alter table ev_evses add column if not exists status_lock timestamptz;

-- Presupuesto con ventana deslizante de 1 hora (REVE: 1.000 peticiones/hora por clave)
create table if not exists ev_req_log (id bigserial primary key, k text not null, ts timestamptz not null default now());
create index if not exists ev_req_log_k_ts on ev_req_log (k, ts);
alter table ev_req_log enable row level security;

create or replace function ev_take_budget(p_key text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('ev_budget:' || p_key));
  select count(*) into n from ev_req_log where k = p_key and ts > now() - interval '1 hour';
  if n >= p_max then
    return false;
  end if;
  insert into ev_req_log (k) values (p_key);
  if random() < 0.02 then
    delete from ev_req_log where ts < now() - interval '2 hours';
  end if;
  return true;
end $$;

-- Tras un 429 de REVE: da por gastado el presupuesto de la hora
create or replace function ev_exhaust_budget(p_key text, p_max int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('ev_budget:' || p_key));
  select count(*) into n from ev_req_log where k = p_key and ts > now() - interval '1 hour';
  insert into ev_req_log (k) select p_key from generate_series(1, greatest(0, p_max - n));
end $$;

-- Reserva atómica de los puntos de una ubicación cuyo estado hay que pedir a REVE
create or replace function ev_claim_live(p_location text, p_limit int default 16)
returns table (id text, evse_id text)
language sql
security definer
set search_path = public
as $$
  update ev_evses e set status_lock = now()
  where e.id in (
    select x.id from ev_evses x
    where x.location_id = p_location
      and (x.status_lock is null or x.status_lock < now() - interval '15 minutes')
      and (x.status_checked is null or x.status_checked < now() - interval '15 minutes')
    order by x.evse_id
    limit greatest(1, least(p_limit, 16))
    for update skip locked
  )
  returning e.id, e.evse_id;
$$;

-- El estado operativo ya no toca synced_at (synced_at = visto en la última pasada de ubicaciones)
create or replace function ev_apply_status(p_rows jsonb)
returns int
language sql
security definer
set search_path = public
as $$
  with upd as (
    update ev_evses e set
      operational = (r->>'operational')::boolean,
      operational_updated = nullif(r->>'operational_updated', '')::timestamptz
    from jsonb_array_elements(p_rows) r
    where e.id = r->>'id'
    returning 1
  )
  select count(*)::int from upd;
$$;

-- Borra lo que REVE ya no publica (se llama tras cada pasada completa diaria de ubicaciones)
create or replace function ev_cleanup(p_older_than interval default interval '3 days')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare a int; b int; c int;
begin
  delete from ev_evses where synced_at < now() - p_older_than;
  get diagnostics a = row_count;
  delete from ev_locations where synced_at < now() - p_older_than;
  get diagnostics b = row_count;
  delete from ev_evses e where not exists (select 1 from ev_locations l where l.id = e.location_id);
  get diagnostics c = row_count;
  return a + b + c;
end $$;

-- Fecha de la última actualización correcta (la que exige mostrar REVE)
create or replace function ev_last_sync()
returns timestamptz
language sql stable
security definer
set search_path = public
as $$
  select max(last_ok_at) from ev_sync_state where resource in ('locations', 'tariffs', 'status');
$$;

revoke all on function ev_take_budget(text, int) from public, anon, authenticated;
revoke all on function ev_exhaust_budget(text, int) from public, anon, authenticated;
revoke all on function ev_claim_live(text, int) from public, anon, authenticated;
revoke all on function ev_apply_status(jsonb) from public, anon, authenticated;
revoke all on function ev_cleanup(interval) from public, anon, authenticated;
grant execute on function ev_take_budget(text, int) to service_role;
grant execute on function ev_exhaust_budget(text, int) to service_role;
grant execute on function ev_claim_live(text, int) to service_role;
grant execute on function ev_apply_status(jsonb) to service_role;
grant execute on function ev_cleanup(interval) to service_role;
grant execute on function ev_last_sync() to anon, authenticated;

-- Las tarifas se vuelven a cargar enteras con el nuevo cálculo (fechas de validez e IVA)
update ev_sync_state set phase = 'full', next_page = 1, total_pages = null, pass_started = null, errors = 0, retry_at = null
where resource = 'tariffs';

-- Índice duplicado (lo avisa Supabase)
drop index if exists ev_evses_location_idx;

-- Puntos de recarga cerca de una ruta: cajas pequeñas alrededor de puntos del recorrido
create or replace function chargers_in_boxes(p_points jsonb, p_km double precision default 2.5, p_limit int default 1500)
returns jsonb
language sql stable
set search_path = public
as $$
  with pts as (
    select (p->>0)::double precision as lat, (p->>1)::double precision as lon
    from jsonb_array_elements(p_points) p
    limit 2000
  ), k as (
    select least(greatest(coalesce(p_km, 2.5), 0.5), 10) as km
  ), cand as (
    select distinct l.id
    from pts, k, ev_locations l
    where l.lat between pts.lat - k.km / 111.0 and pts.lat + k.km / 111.0
      and l.lon between pts.lon - k.km / (111.0 * cos(radians(pts.lat))) and pts.lon + k.km / (111.0 * cos(radians(pts.lat)))
    limit least(greatest(coalesce(p_limit, 1500), 1), 3000)
  )
  select jsonb_build_object(
    'updated', ev_last_sync(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'address', l.address, 'city', l.city,
        'operator', l.operator, 'party', l.party_id,
        'lat', l.lat, 'lon', l.lon, 'h24', l.twentyfourseven, 'updated', l.updated_at,
        'evses', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'op', e.operational, 'st', e.status, 'stu', e.status_updated, 'chk', e.status_checked, 'kw', e.max_kw,
            'c', ev_connectors_json(e.connectors)
          ) order by e.evse_id), '[]'::jsonb)
          from ev_evses e where e.location_id = l.id
        )
      ))
      from ev_locations l join cand on cand.id = l.id
    ), '[]'::jsonb)
  );
$$;
grant execute on function chargers_in_boxes(jsonb, double precision, int) to anon, authenticated;
