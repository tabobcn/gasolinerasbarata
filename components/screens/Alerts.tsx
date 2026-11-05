"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav, EmptyState, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { useLocation } from "../LocationProvider";
import { stationHref } from "../StationRow";
import { alertsStore, uid, useAlerts, usePlaces, useSettings, type PriceAlert } from "@/lib/store";
import { evaluateAlert, zoneOf, type AlertState } from "@/lib/alerts";
import { stationsUrl, useJSON } from "@/lib/useJSON";
import { fuelByKey, FUELS } from "@/lib/fuels";
import { fmtKm, fmtPrice } from "@/lib/format";
import type { StationsResponse } from "@/lib/types";
import { useDiscounts } from "@/lib/discountStore";
import { applyDiscounts } from "@/lib/discounts";

/* ---------- Lista de alertas ---------- */

function AlertCard({ a }: { a: PriceAlert }) {
  const { loc } = useLocation();
  const [places] = usePlaces();
  const [st, setSt] = useState<AlertState | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    evaluateAlert(a, places, loc)
      .then((r) => alive && setSt(r))
      .catch(() => alive && setSt(null));
    return () => {
      alive = false;
    };
  }, [a, places, loc]);
  const zone = zoneOf(a, places, loc);
  return (
    <div className={`card stack-8 ${st?.hit ? "hit" : ""}`}>
      <div className="row-between">
        <span className="b15">
          {fuelByKey(a.fuel)?.label} por debajo de {a.threshold.toFixed(2).replace(".", ",")} €
        </span>
        <button type="button" className="icon-btn ghost" aria-label="Borrar alerta" onClick={() => alertsStore.set((l) => l.filter((x) => x.id !== a.id))}>
          <Icon name="trash" size={18} />
        </button>
      </div>
      <span className="muted sm">
        Cerca de {zone?.label ?? "un sitio borrado"} · {a.radius} km{a.favDrop ? " · y si una favorita baja 3 cts" : ""}
      </span>
      {st === undefined && <Skeleton h={20} r={6} />}
      {st && st.cheapest && (
        <Link href={stationHref(st.cheapest)} className={`status-line ${st.hit ? "green" : ""}`}>
          {st.hit ? <Icon name="check" size={16} stroke={2.6} /> : <Icon name="clock" size={16} />}
          {st.hit ? "¡Se cumple! " : "Ahora la más barata: "}
          {st.cheapest.name} a {fmtPrice(st.cheapestPrice)} €
        </Link>
      )}
      {st && !st.cheapest && <span className="muted sm">No hay gasolineras con ese combustible en la zona.</span>}
    </div>
  );
}

export function AlertsList() {
  const [alerts] = useAlerts();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top">
        <div className="row-between">
          <h1 className="h1 big">Alertas</h1>
          <Link href="/alertas/nueva" className="btn primary small">
            <Icon name="plus" size={16} stroke={2.6} /> Nueva
          </Link>
        </div>
        {!alerts.length && (
          <EmptyState icon="bell" title="Sin alertas todavía" text="Te avisamos cuando el combustible baje del precio que elijas cerca de casa, del trabajo o de donde estés.">
            <Link href="/alertas/nueva" className="btn primary">
              Crear mi primera alerta
            </Link>
          </EmptyState>
        )}
        {alerts.map((a) => (
          <AlertCard key={a.id} a={a} />
        ))}
        {alerts.length > 0 && (
          <div className="note blue">
            <Icon name="info" size={18} />
            <span>
              Las alertas se comprueban cada vez que abres la app
              {perm === "granted" ? " y te llega un aviso del sistema." : perm === "denied" ? ". Tienes los avisos bloqueados en el navegador." : "."} Para avisos con la app cerrada hará falta un pequeño servidor (fase 2).
            </span>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

/* ---------- Nueva alerta ---------- */

export function NewAlert() {
  const router = useRouter();
  const { loc } = useLocation();
  const [places] = usePlaces();
  const [settings] = useSettings();
  const [zone, setZone] = useState<string>("yo");
  const [fuel, setFuel] = useState(settings.fuel);
  const [radius, setRadius] = useState(5);
  const [cents, setCents] = useState<number | null>(null); // en céntimos de euro ×10 (milésimas)
  const [favDrop, setFavDrop] = useState(true);

  // Valores iniciales cuando ya se han leído los datos guardados en el móvil
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    const z = new URLSearchParams(window.location.search).get("zone");
    if (z && places.some((p) => p.id === z)) setZone(z);
    else {
      const casa = places.find((p) => p.kind === "casa");
      if (casa) setZone(casa.id);
    }
  }, [places]);
  useEffect(() => {
    if (touched.current) return;
    setFuel(settings.fuel);
    setCents(null);
  }, [settings.fuel]);

  const z = zone === "yo" ? (loc ? { lat: loc.lat, lon: loc.lon, label: "ti" } : null) : places.find((p) => p.id === zone);
  const { data } = useJSON<StationsResponse>(z ? stationsUrl(z.lat, z.lon, radius) : null);
  const [disc] = useDiscounts();
  const withFuel = applyDiscounts(data?.stations ?? [], disc).filter((s) => s.prices[fuel] != null);
  const cheapest = [...withFuel].sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)[0];
  const minPrice = cheapest?.prices[fuel] ?? null;

  // Umbral por defecto: 2 cts por debajo de la más barata actual
  useEffect(() => {
    if (cents == null && minPrice != null) setCents(Math.round((minPrice - 0.02) * 100));
  }, [minPrice, cents]);
  const threshold = (cents ?? 150) / 100;
  const zoneName = zone === "yo" ? "ti" : (places.find((p) => p.id === zone)?.label.toLowerCase() ?? "");

  const save = async () => {
    const a: PriceAlert = { id: uid(), fuel, zone, radius, threshold, favDrop, createdAt: new Date().toISOString() };
    alertsStore.set((l) => [...l, a]);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
    } catch {
      /* ignorar */
    }
    router.push("/alertas");
  };

  const fmt2 = (n: number) => n.toFixed(2).replace(".", ",");

  return (
    <div className="screen with-bar">
      <div className="stack-16 pad-x top">
        <div className="row-12">
          <Link href="/alertas" aria-label="Volver" className="icon-btn round">
            <Icon name="back" size={20} stroke={2.4} />
          </Link>
          <h1 className="h1">Nueva alerta</h1>
        </div>

        <div className="preview-notif" role="img" aria-label="Vista previa del aviso">
          <span className="notif-icon" aria-hidden="true">
            <Icon name="bell" size={20} />
          </span>
          <span className="col-2 min0">
            <span className="xs muted">Así te avisaremos</span>
            <span className="b14">
              {fuelByKey(fuel)?.label} a {fmt2(threshold - 0.01)}9 € cerca de {zoneName}
            </span>
            <span className="xs muted ellipsis">{cheapest ? `${cheapest.name} · a ${fmtKm(cheapest.dist)} · toca para ir` : "Gasolinera · distancia · toca para ir"}</span>
          </span>
        </div>

        <div className="card stack-16">
          <div className="stack-8">
            <span className="eyebrow">ZONA</span>
            <div className="chips wrap">
              {places.map((p) => (
                <button key={p.id} type="button" className={`chip soft${zone === p.id ? " on" : ""}`} aria-pressed={zone === p.id} onClick={() => ((touched.current = true), setZone(p.id))}>
                  {p.label}
                </button>
              ))}
              <button type="button" className={`chip soft${zone === "yo" ? " on" : ""}`} aria-pressed={zone === "yo"} onClick={() => ((touched.current = true), setZone("yo"))}>
                Donde esté
              </button>
              {!places.length && (
                <Link href="/favoritas" className="chip soft">
                  + Guardar Casa o Trabajo
                </Link>
              )}
            </div>
          </div>

          <div className="stack-8">
            <span className="eyebrow">COMBUSTIBLE</span>
            <div className="chips scroll-x">
              {FUELS.filter((f) => settings.fuels.includes(f.key) || f.key === fuel).map((f) => (
                <button key={f.key} type="button" className={`chip soft${fuel === f.key ? " on" : ""}`} aria-pressed={fuel === f.key} onClick={() => ((touched.current = true), setFuel(f.key), setCents(null))}>
                  {f.chip}
                </button>
              ))}
            </div>
          </div>

          <div className="stack-8">
            <label htmlFor="radio" className="row-between">
              <span className="eyebrow">RADIO</span>
              <span className="b15">{radius} km</span>
            </label>
            <input id="radio" className="range" type="range" min={1} max={25} step={1} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
            <span className="muted b12">{z ? (data ? `${withFuel.length} gasolineras dentro del radio` : "Contando gasolineras…") : "Necesitamos tu ubicación para esta zona"}</span>
          </div>

          <div className="stack-8">
            <span className="eyebrow">AVÍSAME SI {fuelByKey(fuel)?.label.toUpperCase()} BAJA DE</span>
            <div className="threshold">
              <button type="button" aria-label="Bajar un céntimo" onClick={() => setCents((c) => (c ?? 150) - 1)}>
                <Icon name="minus" size={22} stroke={2.6} />
              </button>
              <span className="threshold-val">
                <span className="num">{fmt2(threshold)}</span>
                <span className="unit">€/l</span>
              </span>
              <button type="button" aria-label="Subir un céntimo" onClick={() => setCents((c) => (c ?? 150) + 1)}>
                <Icon name="plus" size={22} stroke={2.6} />
              </button>
            </div>
            <span className="muted b12 center">{minPrice != null ? `Ahora la más barata de la zona está a ${fmtPrice(minPrice)} €` : " "}</span>
          </div>
        </div>

        <label className="card row-12 toggle-row">
          <span className="b14 grow">Avisar también si una favorita baja 3 cts o más</span>
          <input type="checkbox" className="switch" checked={favDrop} onChange={() => setFavDrop((f) => !f)} />
        </label>
      </div>
      <div className="action-bar">
        <button type="button" className="btn primary big grow" onClick={save} disabled={!z}>
          <Icon name="bell" size={20} /> Guardar alerta
        </button>
      </div>
    </div>
  );
}
