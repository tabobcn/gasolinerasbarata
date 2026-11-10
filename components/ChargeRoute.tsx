"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, Skeleton } from "./ui";
import { Icon } from "./Icon";
import { ChargerTile } from "./ChargerBits";
import { navUrl } from "./NavigateProvider";
import { useSettings } from "@/lib/store";
import { r3, useJSON } from "@/lib/useJSON";
import { fmtMinutes } from "@/lib/format";
import { availText, carFrom, chargerHref, chargerName, datesText, doubtText, priceNote, PLUG_LABEL, routeGroup, summarize, type ChargerRouteResponse } from "@/lib/chargers";

type Pt = { lat: number; lon: number; label: string };

const euro = (n: number) => n.toFixed(2).replace(".", ",");
const kw = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} kW`;

/** Puntos de recarga en el camino (modo carga de la pantalla Ruta) */
export function ChargeRoute({ origin, to }: { origin: Pt; to: Pt }) {
  const [settings] = useSettings();
  const car = carFrom(settings);
  const canFast = car.electric && car.dc > 0;
  const [fastPref, setFast] = useState<boolean | null>(null);
  const fast = fastPref ?? canFast; // por defecto, en viaje, solo carga rápida si tu coche la admite

  const url =
    `/api/route/chargers?from=${r3(origin.lat)},${r3(origin.lon)}&to=${r3(to.lat)},${r3(to.lon)}` +
    `&ev=${car.electric ? 1 : 0}&plugs=${car.plugs.join(",")}&ac=${car.ac}&dc=${car.dc}&battery=${car.battery}&fast=${fast ? 1 : 0}`;
  const { data, error, loading } = useJSON<ChargerRouteResponse>(url);

  const stops = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return data.stops
      .map((st) => {
        const s = summarize(st.charger, car, now);
        return { st, s, g: routeGroup(s, car, fast, now) };
      })
      .filter((x): x is typeof x & { g: NonNullable<typeof x.g> } => x.g !== null);
  }, [data, fast, car.electric, car.plugs.join(","), car.ac, car.dc, car.battery]); // eslint-disable-line react-hooks/exhaustive-deps

  const best = stops[0];
  const total = data?.distanceKm || 1;
  const target = (dc: boolean) => (dc ? "20 → 80 %" : "20 → 100 %");

  return (
    <>
      {!car.electric && (
        <Link href="/mi-coche" className="note blue link">
          <Icon name="car" size={16} stroke={2.4} />
          <span className="grow">Dinos tu coche eléctrico o híbrido y te enseñamos solo los cargadores que te sirven y lo que cuesta cargar.</span>
          <span className="b13">Mi coche</span>
        </Link>
      )}

      {canFast && (
        <div className="chips" role="group" aria-label="Filtros">
          <button type="button" className={`chip shadow${fast ? " on" : ""}`} aria-pressed={fast} onClick={() => setFast(!fast)}>
            {fast && <Icon name="check" size={14} stroke={2.8} />}
            Solo carga rápida
          </button>
        </div>
      )}

      {loading && !data && (
        <>
          <Skeleton h={90} r={22} />
          <Skeleton h={160} r={22} />
          <Skeleton />
        </>
      )}
      {error && !data && <EmptyState icon="info" title="No hemos podido calcular la ruta" text={error} />}

      {data && (
        <>
          <div className="card stack-8">
            <span className="b14">
              {data.distanceKm} km · {fmtMinutes(data.durationMin)}
            </span>
            <span className="muted b12">{data.considered} puntos de recarga a menos de 3 km del recorrido</span>
          </div>

          <div className="card route-strip" role="img" aria-label={`Recorrido de ${data.distanceKm} km con ${Math.min(4, stops.length)} paradas recomendadas`}>
            <div className="strip">
              <span className="strip-line" />
              <span className="strip-end start" style={{ left: "0%" }} />
              <span className="strip-end" style={{ left: "100%" }} />
              {stops.slice(0, 4).map(({ st }, i) => (
                <span key={st.charger.id} className={`strip-stop ev${i === 0 ? " best" : ""}`} style={{ left: `${Math.min(100, (st.kmAlong / total) * 100)}%` }}>
                  {i === 0 ? "1" : ""}
                </span>
              ))}
            </div>
            <div className="strip-labels">
              <span>{origin.label.replace(/^Mi ubicación · /, "")}</span>
              {data.waypoints.map((w) => (
                <span key={w.km}>{w.label}</span>
              ))}
              <span>{to.label}</span>
            </div>
          </div>

          <div className="row-between baseline">
            <h2 className="h2">Dónde cargar</h2>
            <span className="muted b13">Por coste, con el desvío</span>
          </div>

          {!stops.length && (
            <EmptyState
              icon="plug"
              title="Sin cargadores que te sirvan en la ruta"
              text={fast ? "No hay carga rápida compatible a menos de 3 km del recorrido." : "No hay puntos compatibles y en funcionamiento a menos de 3 km del recorrido."}
            >
              {fast && (
                <button type="button" className="btn soft" onClick={() => setFast(false)}>
                  Incluir carga lenta
                </button>
              )}
            </EmptyState>
          )}

          {best && (
            <div className="card hero stack-12">
              <Link href={chargerHref(best.st.charger)} className="row-12 plain">
                <ChargerTile ch={best.st.charger} size={48} />
                <span className="col-2 grow min0 left">
                  <span className="b17 clamp-2">{chargerName(best.st.charger)}</span>
                  <span className="muted sm">
                    Km {best.st.kmAlong} · desvío +{best.st.detourMin} min · {PLUG_LABEL[best.g.kind]} {kw(best.g.kw)}
                  </span>
                </span>
              </Link>
              <div className="row-between end wrap-gap">
                {best.g.price != null ? (
                  <span className="big-price blue">
                    <span className="num">{euro(best.g.price)}</span>
                    <span className="unit">€/kWh</span>
                  </span>
                ) : (
                  <span className="b15 muted">Precio no disponible en REVE</span>
                )}
                <span className={`b12 tone-${availText(best.s.avail).tone}`}>{availText(best.s.avail).text}</span>
              </div>
              {best.g.doubtful && <span className="muted b12">{doubtText(best.g)}</span>}
              {!best.g.doubtful && !best.g.vatKnown && best.g.price != null && <span className="muted b12">El operador no indica si el precio lleva IVA.</span>}
              <div className="saving-box">
                Cargar {target(best.g.dc)}:{" "}
                <strong>
                  {best.g.trip.cost != null ? `${euro(best.g.trip.cost)} € · ` : ""}
                  {fmtMinutes(best.g.trip.minutes)}
                </strong>
              </div>
              <div className="row-10">
                <a className="btn primary grow" href={navUrl("maps", best.st.charger, { origin, destination: to })} target="_blank" rel="noopener">
                  <Icon name="plus" size={16} stroke={2.6} /> Añadir parada
                </a>
                <Link href={chargerHref(best.st.charger)} className="btn soft">
                  Ver ficha
                </Link>
              </div>
            </div>
          )}

          <div className="stack-8">
            {stops.slice(1).map(({ st, s, g }) => (
              <Link key={st.charger.id} href={chargerHref(st.charger)} className="row-card">
                <ChargerTile ch={st.charger} size={40} />
                <span className="col-2 grow min0">
                  <span className="b15 ellipsis">{chargerName(st.charger)}</span>
                  <span className="muted b12 ellipsis">
                    Km {st.kmAlong} · desvío +{st.detourMin} min · {PLUG_LABEL[g.kind]} {kw(g.kw)}
                  </span>
                  <span className={`b12 tone-${availText(s.avail).tone}`}>{availText(s.avail).text}</span>
                </span>
                <span className="col-2 end">
                  <span className={`price-sm${g.price != null ? " blue-ink" : " muted"}`}>{g.price != null ? `${euro(g.price)} €` : "—"}</span>
                  <span className="muted b12 nowrap">
                    {g.doubtful || !g.vatKnown ? `${priceNote(g)} · ` : g.trip.cost != null ? `${euro(g.trip.cost)} € · ` : ""}
                    {fmtMinutes(g.trip.minutes)}
                  </span>
                </span>
              </Link>
            ))}
          </div>

          <p className="source">
            Fuente: Red Eléctrica de España (REVE). {datesText(data.updated, data.prices)} Ruta calculada con OSRM (OpenStreetMap). Coste y tiempo
            aproximados de cargar del 20 al 80 % en carga rápida y del 20 al 100 % en carga normal, con precios con IVA cuando el operador lo indica. Para ordenar
            se suma lo que gastas en el desvío.
          </p>
        </>
      )}
    </>
  );
}
