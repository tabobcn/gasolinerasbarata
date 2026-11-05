"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { EmptyState, Skeleton } from "../ui";
import { ChargerTile } from "../ChargerBits";
import { ShareButton } from "../ShareButton";
import { useLocation } from "../LocationProvider";
import { useNavigate } from "../NavigateProvider";
import { useSettings } from "@/lib/store";
import { getJSON, useJSON } from "@/lib/useJSON";
import { haversineKm } from "@/lib/geo";
import { etaMin, fmtKm, fmtMinutes } from "@/lib/format";
import {
  availability,
  availText,
  carFrom,
  chargerName,
  cpoStyle,
  facilitiesText,
  fmtDateTime,
  fmtKwhPrice,
  minutesAgo,
  openingText,
  parkingText,
  paymentMethods,
  PLUG_LABEL,
  prettyAddress,
  prettyCity,
  reservable,
  summarize,
  hasPrice,
  vatPct,
  tariffLines,
  zeroOnly,
  type Charger,
  type ChargerDetailResponse,
  type ConnGroup,
  type LiveResponse,
} from "@/lib/chargers";

const euro = (n: number) => n.toFixed(2).replace(".", ",");
const kw = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} kW`;
const groupLabel = (g: ConnGroup) => `${PLUG_LABEL[g.kind]} · ${kw(g.kw)} (${g.dc ? "rápida" : "AC"})`;

export function ChargerDetail({ id }: { id: string }) {
  const router = useRouter();
  const [settings] = useSettings();
  const car = carFrom(settings);
  const { loc } = useLocation();
  const goTo = useNavigate();
  const { data, error, loading, reload } = useJSON<ChargerDetailResponse>(`/api/chargers/${encodeURIComponent(id)}`);

  const [live, setLive] = useState<LiveResponse | null>(null);
  const [liveState, setLiveState] = useState<"loading" | "ok" | "error">("loading");
  const fetchLive = useCallback(
    (force: boolean) => {
      setLiveState("loading");
      getJSON<LiveResponse>(`/api/chargers/${encodeURIComponent(id)}/live`, force)
        .then((r) => {
          setLive(r);
          setLiveState("ok");
        })
        .catch(() => setLiveState("error"));
    },
    [id],
  );
  useEffect(() => fetchLive(false), [fetchLive]);

  // Mezcla el estado en tiempo real con la ficha
  const ch: Charger | null = useMemo(() => {
    if (!data?.item) return null;
    if (!live) return data.item;
    const m = new Map(live.evses.map((e) => [e.id, e]));
    return {
      ...data.item,
      evses: data.item.evses.map((e) => {
        const l = m.get(e.id);
        return l ? { ...e, st: l.st, stu: l.stu, chk: l.chk } : e;
      }),
    };
  }, [data, live]);

  const s = useMemo(() => (ch ? summarize(ch, car) : null), [ch, car.electric, car.plugs.join(","), car.ac, car.dc, car.battery]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = s ? s.groups.find((g) => g.key === selKey) ?? s.best ?? s.groups[0] ?? null : null;

  const dist = ch && loc ? haversineKm(loc.lat, loc.lon, ch.lat, ch.lon) : null;
  const lastCheck = ch?.evses.map((e) => e.chk).filter(Boolean).sort().pop() ?? null;
  // REVE permite pocas consultas por punto y hora: se guarda 15 minutos y no se puede pedir antes
  const canRefresh = !lastCheck || Date.now() - Date.parse(lastCheck) > 15 * 60_000;

  if (error && !data) {
    return (
      <div className="screen pad-x top">
        <EmptyState icon="info" title="No hemos podido abrir este punto de recarga" text={error}>
          <div className="row-8 wrap center">
            <button type="button" className="btn soft" onClick={reload}>
              <Icon name="refresh" size={18} /> Reintentar
            </button>
            <Link href="/carga" className="btn primary">
              Ver cargadores cerca
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  if (!ch || !s) {
    return (
      <div className="screen pad-x top stack-14">
        <Skeleton h={60} />
        <Skeleton h={150} r={22} />
        <Skeleton h={140} r={22} />
        {loading && <span className="sr-only">Cargando…</span>}
      </div>
    );
  }

  const name = chargerName(ch);
  const cpo = cpoStyle(ch.party, ch.operator);
  const pays = paymentMethods(ch);
  const hours = openingText(ch);
  const parking = parkingText(ch.parking);
  const facs = facilitiesText(ch.facilities);
  const lines = sel ? tariffLines(sel.conn) : [];
  const target = { lat: ch.lat, lon: ch.lon, name, address: ch.address ?? "", brand: cpo.name, dist: dist ?? undefined };

  return (
    <div className="screen with-bar">
      <div className="stack-14 pad-x top">
        <div className="row-between">
          <button type="button" aria-label="Volver" className="icon-btn round" onClick={() => (history.length > 1 ? router.back() : router.push("/carga"))}>
            <Icon name="back" size={20} stroke={2.4} />
          </button>
          <div className="row-10">
            <span className="muted b12">
              {liveState === "loading" ? "Comprobando disponibilidad…" : lastCheck ? `Disponibilidad ${minutesAgo(lastCheck)}` : liveState === "error" ? "Sin disponibilidad en directo" : ""}
            </span>
            <ShareButton title={name} text={`${name}: punto de recarga`} />
          </div>
        </div>

        <div className="row-14">
          <ChargerTile ch={ch} size={60} />
          <div className="col-4 min0">
            <h1 className="h1">{name}</h1>
            <span className="muted sm">
              {[prettyAddress(ch.address), prettyCity(ch.city), dist != null ? `${fmtKm(dist)} · ${etaMin(dist)} min` : null, ch.h24 ? "24 h" : null].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>

        {s.groups.length > 0 ? (
          <section className="card tight" aria-label="Enchufes y precios">
            {s.groups.map((g, i) => {
              const t = availText(availability(g.evses));
              const on = sel?.key === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`conn-row${i < s.groups.length - 1 ? " line" : ""}${g.compatible ? "" : " dim"}${on && s.groups.length > 1 ? " sel" : ""}`}
                  aria-pressed={s.groups.length > 1 ? on : undefined}
                  onClick={() => setSelKey(g.key)}
                >
                  <span className={`soft-icon${g.compatible ? " blue" : ""}`} aria-hidden="true">
                    <Icon name={g.dc ? "bolt" : "plug"} size={20} stroke={2.2} />
                  </span>
                  <span className="col-2 grow min0 left">
                    <span className="b15 strong">{groupLabel(g)}</span>
                    <span className={`b12 tone-${g.compatible ? t.tone : "muted"}`}>
                      {t.text}
                      {!g.compatible && car.electric ? " · tu coche no lo admite" : ""}
                    </span>
                  </span>
                  <span className="col-0 end">
                    <span className={`price-sm${g.compatible && !g.doubtful ? " blue-ink" : " muted"}`}>{g.price != null ? fmtKwhPrice(g.price) : "—"}</span>
                    {g.doubtful && <span className="muted b12">a confirmar</span>}
                  </span>
                </button>
              );
            })}
          </section>
        ) : (
          <div className="note">Este punto no tiene enchufes publicados en REVE.</div>
        )}

        {sel && car.electric && sel.compatible && (
          <section className="car-card">
            <span className="b13 soft-text">
              Para tu {car.label} (batería {car.battery} kWh, carga máx. {kw(sel.dc ? car.dc : car.ac)})
            </span>
            <span className="row-between end wrap-gap">
              <span className="col-0">
                <span className="b13 soft-text">Cargar del 20 % al 100 %</span>
                <span className="car-cost">
                  {sel.fill.cost != null ? `${euro(sel.fill.cost)} €` : `~${fmtMinutes(sel.fill.minutes)}`}
                </span>
              </span>
              <span className="col-2 end">
                <span className="b18">{sel.fill.cost != null ? `~${fmtMinutes(sel.fill.minutes)}` : "Precio no disponible"}</span>
                <span className="b12 soft-text">
                  {String(Math.round(sel.fill.kwh * 10) / 10).replace(".", ",")} kWh a {kw(sel.fill.kw)}
                </span>
              </span>
            </span>
            {sel.doubtful && <span className="b12 soft-text">Ojo: el precio que publica el operador en REVE es demasiado bajo para ser real. Confírmalo en su app.</span>}
            {sel.kw > sel.fill.kw + 0.05 && (
              <span className="b12 soft-text">
                El cargador da {kw(sel.kw)}, pero tu coche carga como máximo a {kw(sel.fill.kw)}
              </span>
            )}
          </section>
        )}

        {sel && car.electric && !sel.compatible && (
          <div className="note amber">
            <Icon name="info" size={16} />
            <span>Tu coche no admite {PLUG_LABEL[sel.kind]}{sel.dc ? " (carga rápida)" : ""}. Si no es así, cámbialo en Mi coche.</span>
          </div>
        )}

        {!car.electric && (
          <Link href="/mi-coche" className="note blue link">
            <Icon name="car" size={16} stroke={2.4} />
            <span className="grow">Dinos tu batería y tus enchufes y te calculamos cuánto cuesta y cuánto tarda llenar aquí.</span>
            <span className="b13">Mi coche</span>
          </Link>
        )}

        {sel && (
          <section className="stack-8" aria-labelledby="tarifa">
            <h2 className="h3" id="tarifa">
              Precio{s.groups.length > 1 ? ` · ${PLUG_LABEL[sel.kind]} ${kw(sel.kw)}` : ""}
            </h2>
            {lines.length ? (
              <div className="card tight">
                {lines.map((l, i) => (
                  <div key={i} className={`tariff-line${i < lines.length - 1 ? " line" : ""}`}>
                    <span className="col-2 grow min0">
                      <span className="b14">{l.label}</span>
                      {l.note && <span className="muted b12">{l.note}</span>}
                    </span>
                    <span className="b15 nowrap">{l.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="note">
                {zeroOnly(sel.conn)
                  ? "En REVE este punto figura con un precio de 0 €. Puede que sea gratis o que el operador no haya puesto su tarifa real: compruébalo en su app antes de cargar."
                  : "El operador no ha publicado el precio de este punto en REVE. Consúltalo en su app antes de cargar."}
              </div>
            )}
            {hasPrice(sel.conn) && (
              <span className="muted xs">
                {vatPct(sel.conn.v) != null ? `Precios con IVA (${vatPct(sel.conn.v)} %)` : "El operador no indica IVA: precio tal cual lo publica"}
                {sel.conn.tu ? ` · tarifa publicada el ${fmtDateTime(sel.conn.tu)}` : ""}
              </span>
            )}
          </section>
        )}

        {(pays.length > 0 || reservable(ch)) && (
          <section className="stack-8" aria-labelledby="pago">
            <h2 className="h3" id="pago">
              Cómo se paga
            </h2>
            <div className="chips wrap">
              {pays.map((p) => (
                <span key={p} className="chip-static">
                  <Icon name={p.startsWith("App") ? "share" : "card"} size={16} />
                  {p}
                </span>
              ))}
              {reservable(ch) && (
                <span className="chip-static green">
                  <Icon name="clock" size={16} /> Se puede reservar
                </span>
              )}
            </div>
          </section>
        )}

        <section className="card tight" aria-label="Información">
          <InfoRow label="Operador" value={ch.operator ?? cpo.name} />
          {hours && <InfoRow label="Horario" value={hours} />}
          {parking && <InfoRow label="Dónde está" value={parking} />}
          {facs.length > 0 && <InfoRow label="Cerca" value={facs.join(", ")} />}
          <InfoRow label="Puntos de carga" value={`${ch.evses.length}${ch.evses.some((e) => e.floor) ? ` · planta ${[...new Set(ch.evses.map((e) => e.floor).filter(Boolean))].join(", ")}` : ""}`} last />
        </section>

        <p className="source">
          Fuente: Red Eléctrica de España (REVE, Registro de Vehículo Eléctrico). Datos del operador actualizados el {fmtDateTime(ch.updated)}; sincronizados el{" "}
          {fmtDateTime(data?.updated)}.{lastCheck ? ` Disponibilidad consultada el ${fmtDateTime(lastCheck)}.` : ""} Los precios con IVA se calculan a partir de la tarifa sin IVA y el IVA
          que publica el operador (si no lo indica, se muestra el precio tal cual); el tiempo y el coste de carga son aproximados.
        </p>
      </div>

      <div className="action-bar">
        <button type="button" className="btn soft h52" onClick={() => fetchLive(true)} disabled={liveState === "loading" || !canRefresh}>
          <Icon name="refresh" size={18} /> {liveState === "loading" ? "Comprobando…" : canRefresh ? "Actualizar" : "Al día"}
        </button>
        <button type="button" className="btn primary big grow" onClick={() => goTo(target)}>
          <Icon name="navigate" size={20} stroke={2.4} /> Ir
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`info-row${last ? "" : " line"}`}>
      <span className="muted b13">{label}</span>
      <span className="b14 right">{value}</span>
    </div>
  );
}
