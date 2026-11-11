"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useJSON } from "@/lib/useJSON";
import type { HistoryResponse, StationDetailResponse } from "@/lib/types";
import { FUELS, fuelByKey } from "@/lib/fuels";
import { fmtEuros, fmtKm, fmtPrice, signedCents, etaMin, timeAgo } from "@/lib/format";
import { openStatus, prettySchedule } from "@/lib/hours";
import { haversineKm } from "@/lib/geo";
import { favoritesStore, useFavorites, useSettings } from "@/lib/store";
import { useLocation } from "../LocationProvider";
import { useNavigate } from "../NavigateProvider";
import { BrandTile, EmptyState, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { useDiscounts } from "@/lib/discountStore";
import { discountFor, PROGRAMS } from "@/lib/discounts";
import { activeOffers, fmtDay } from "@/lib/offers";
import { knownBrand } from "@/lib/brands";
import { ShareButton } from "../ShareButton";

const WEEKDAYS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

export function StationDetail({ id, m }: { id: string; m: string | null }) {
  const router = useRouter();
  const { loc } = useLocation();
  const [settings] = useSettings();
  const [favs] = useFavorites();
  const goTo = useNavigate();
  const fuel = settings.fuel;
  const { data, error, loading, reload } = useJSON<StationDetailResponse>(m ? `/api/stations/${id}?m=${m}` : null);
  const st = data?.station;
  const [discState] = useDiscounts();
  const myDisc = st ? discountFor(st.brand, discState) : null;
  const brandK = st ? knownBrand(st.brand) : null;
  const offers = brandK ? activeOffers().filter((o) => PROGRAMS.find((p) => p.id === o.program)?.brands.includes(brandK)) : [];
  const histFuel = st && st.prices[fuel] == null ? (FUELS.find((f) => st.prices[f.key] != null)?.key ?? fuel) : fuel;
  const hist = useJSON<HistoryResponse>(st ? `/api/stations/${id}/history?m=${st.munId}&fuel=${histFuel}&days=14` : null);

  const dist = st && loc ? haversineKm(loc.lat, loc.lon, st.lat, st.lon) : undefined;
  const isFav = favs.some((f) => f.id === id);
  const status = st ? openStatus(st.hours, st.provId) : null;

  const chart = useMemo(() => {
    const pts = hist.data?.points.filter((p) => p.price != null) ?? [];
    if (pts.length < 2) return null;
    const prices = pts.map((p) => p.price!);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = Math.max(0.01, max - min);
    // Gráfica de puntos: posición de cada día en % (x) y en % de la altura útil (y); los días sin dato se saltan
    const all = hist.data!.points;
    const n = all.length;
    const dots = all
      .map((p, i) => ({ i, price: p.price, date: p.date }))
      .filter((p): p is { i: number; price: number; date: string } => p.price != null)
      .map((p) => ({ ...p, x: n > 1 ? (p.i / (n - 1)) * 100 : 50, y: max - min < 0.0005 ? 50 : ((max - p.price) / span) * 100 }));
    const lastDot = dots[dots.length - 1];
    const minDot = [...dots].reverse().find((d) => d.price === min)!;
    const maxDot = dots.find((d) => d.price === max)!;
    // Etiquetas con el precio: el último día siempre, y el más caro y el más barato si son otros días
    const labelled = new Map<number, "last" | "min" | "max">([[lastDot.i, "last"]]);
    if (max - min >= 0.005) {
      if (!labelled.has(minDot.i)) labelled.set(minDot.i, "min");
      if (!labelled.has(maxDot.i)) labelled.set(maxDot.i, "max");
    }
    const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
    const points = dots.map((d) => ({
      ...d,
      tag: labelled.get(d.i) ?? null,
      text: `${fmtPrice(d.price)} €`,
      title: `${day(d.date)}: ${fmtPrice(d.price)} €`,
      align: d.x < 12 ? "left" : d.x > 88 ? "right" : "mid",
    }));
    const line = dots.map((d) => `${d.x.toFixed(2)},${d.y.toFixed(2)}`).join(" ");
    const area = `${dots[0].x.toFixed(2)},100 ${line} ${lastDot.x.toFixed(2)},100`;
    const axis = { from: day(all[0].date), to: "Hoy", min: fmtPrice(min), max: fmtPrice(max) };
    const diff = prices[prices.length - 1] - prices[0];
    // ¿qué día de la semana suele estar más barata?
    const byDay = new Map<number, number[]>();
    hist.data!.points.forEach((p) => {
      if (p.price == null) return;
      const d = new Date(p.date + "T12:00:00").getDay();
      byDay.set(d, [...(byDay.get(d) ?? []), p.price]);
    });
    const avgAll = prices.reduce((a, b) => a + b, 0) / prices.length;
    const ranked = [...byDay.entries()].map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length] as const).sort((a, b) => a[1] - b[1]);
    const cheapDay = ranked[0] && avgAll - ranked[0][1] >= 0.005 ? WEEKDAYS[ranked[0][0]] : null;
    return { points, line, area, axis, diff, cheapDay, stable: max - min < 0.005 };
  }, [hist.data]);

  const toggleFav = () => {
    if (!st) return;
    favoritesStore.set((list) => (list.some((f) => f.id === st.id) ? list.filter((f) => f.id !== st.id) : [...list, { id: st.id, m: st.munId, name: st.name, brand: st.brand }]));
  };

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));

  return (
    <div className="screen with-bar">
      <div className="stack-16 pad-x top">
        <div className="row-between">
          <button type="button" aria-label="Volver" className="icon-btn round" onClick={back}>
            <Icon name="back" size={20} stroke={2.4} />
          </button>
          {st && (
            <div className="row-8">
              <ShareButton title={st.name} text={`${st.name} (${st.town || st.mun}): mira sus precios`} />
              <button
                type="button"
                aria-label={isFav ? "Quitar de favoritas" : "Guardar en favoritas"}
                aria-pressed={isFav}
                className={`icon-btn round${isFav ? " fav-on" : ""}`}
                onClick={toggleFav}
              >
                <Icon name="star" size={22} fill={isFav ? "currentColor" : "none"} />
              </button>
            </div>
          )}
        </div>

        {!m && <EmptyState icon="info" title="Enlace incompleto" text="Vuelve a abrir la gasolinera desde la lista o el mapa." />}
        {loading && !data && (
          <>
            <Skeleton h={64} />
            <Skeleton h={230} r={22} />
            <Skeleton h={150} r={22} />
          </>
        )}
        {error && !data && (
          <EmptyState icon="info" title="No hemos podido cargar la ficha" text={error}>
            <button type="button" className="btn soft" onClick={reload}>
              Reintentar
            </button>
          </EmptyState>
        )}

        {st && status && (
          <>
            <div className="row-14">
              <BrandTile brand={st.brand} size={64} />
              <div className="col-4 min0">
                <h1 className="h1">{st.name}</h1>
                <span className="muted b14">
                  {st.address} · {st.mun}
                </span>
              </div>
            </div>

            <div className="chips wrap">
              <span className={`chip-static ${status.open === false ? "red" : status.open ? "green" : ""}`}>
                <Icon name="clock" size={14} stroke={2.6} />
                {status.label}
              </span>
              {dist != null && (
                <span className="chip-static white">
                  {fmtKm(dist)} · {etaMin(dist)} min
                </span>
              )}
              <span className="chip-static white">CP {st.cp}</span>
            </div>

            <div className="card tight" aria-label="Precios">
              {FUELS.filter((f) => st.prices[f.key] != null).map((f, i, arr) => {
                const p = st.prices[f.key]!;
                const y = data?.yesterday?.[f.key];
                const change = y != null ? signedCents(p - y) : null;
                const down = y != null && p < y - 0.0005;
                const sel = f.key === fuel;
                return (
                  <div key={f.key} className={`price-row${i < arr.length - 1 ? " line" : ""}${sel ? " sel" : ""}`}>
                    <span className="b15 grow">{f.label}</span>
                    {change && (
                      <span className={`delta${down ? " down" : ""}`} title="Respecto a ayer">
                        {change}
                      </span>
                    )}
                    {myDisc ? (
                      <span className="col-0 end price-md">
                        <span className="strike b12">{fmtPrice(p)} €</span>
                        <span className="green">{fmtPrice(p - myDisc.cts / 100)} €</span>
                      </span>
                    ) : (
                      <span className="price-md">{fmtPrice(p)} €</span>
                    )}
                  </div>
                );
              })}
              {FUELS.every((f) => st.prices[f.key] == null) && <p className="muted sm pad">Esta estación no publica precios de los combustibles habituales.</p>}
            </div>

            {st.prices[histFuel] != null && (
              <p className="fill-line">
                <span>
                  Llenar {settings.tank} litros de {fuelByKey(histFuel)?.label.toLowerCase()}
                </span>
                <strong>{fmtEuros((st.prices[histFuel]! - (myDisc ? myDisc.cts / 100 : 0)) * settings.tank)} €</strong>
              </p>
            )}

            {myDisc && (
              <Link href="/descuentos" className="note amber link">
                <Icon name="card" size={18} />
                <span className="grow">
                  Precios con tu {myDisc.label}: −{myDisc.cts} cts/l. El de surtidor aparece tachado.
                </span>
              </Link>
            )}
            {offers.map((o) => (
              <a key={o.id} href={o.url} target="_blank" rel="noopener" className="note amber link">
                <Icon name="info" size={18} />
                <span className="grow">
                  <strong>Oferta:</strong> {o.title} · hasta el {fmtDay(o.until)}
                </span>
              </a>
            ))}

            <div className="card stack-12">
              <div className="row-between baseline">
                <h2 className="h3">{fuelByKey(histFuel)?.label} · últimos 14 días</h2>
                {chart && !chart.stable && (
                  <span className={`b13 ${chart.diff < 0 ? "green" : chart.diff > 0 ? "red" : ""}`}>{signedCents(chart.diff)}</span>
                )}
              </div>
              {hist.loading && !hist.data && <Skeleton h={72} r={8} />}
              {chart && (
                <div className="pchart" role="img" aria-label={`Evolución del precio en 14 días: de ${chart.points[0].text} a ${chart.points[chart.points.length - 1].text}`}>
                  <div className="pchart-plot">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <polygon points={chart.area} className="pchart-area" />
                      <polyline points={chart.line} className="pchart-line" vectorEffect="non-scaling-stroke" />
                    </svg>
                    {chart.points.map((d) => (
                      <span key={d.i} title={d.title} className={`pchart-dot${d.tag ? ` ${d.tag}` : ""}`} style={{ left: `${d.x}%`, top: `${d.y}%` }}>
                        {d.tag && <span className={`pchart-label ${d.align}${d.tag === "min" || (d.tag === "last" && d.y > 60) ? " below" : ""}`}>{d.text}</span>}
                      </span>
                    ))}
                  </div>
                  <div className="row-between muted b12">
                    <span>{chart.axis.from}</span>
                    <span>{chart.axis.to}</span>
                  </div>
                </div>
              )}
              {chart && (
                <span className="muted b13">
                  {chart.stable
                    ? "Precio estable en las dos últimas semanas"
                    : chart.cheapDay
                      ? `Estas dos semanas ha estado más barata los ${chart.cheapDay}`
                      : "Precio con pocos cambios"}
                </span>
              )}
              {!hist.loading && !chart && <span className="muted sm">Sin histórico suficiente todavía.</span>}
            </div>

            <div className="card row-12 tight-y">
              <span className="soft-icon green" aria-hidden="true">
                <Icon name="clock" size={20} />
              </span>
              <span className="col-2 grow min0">
                <span className="b14">Horario</span>
                <span className="muted b12">{prettySchedule(st.hours) || "No publicado"}</span>
              </span>
            </div>

            <div className="card row-12 tight-y">
              <span className="soft-icon green" aria-hidden="true">
                <Icon name="pin" size={20} />
              </span>
              <span className="col-2 grow min0">
                <span className="b14">Ubicación GPS</span>
                <span className="muted b12">
                  {st.lat.toFixed(5)}, {st.lon.toFixed(5)}
                </span>
              </span>
              <Link href={`/mapa?sel=${st.id}&lat=${st.lat}&lon=${st.lon}`} className="link-btn">
                Ver en mapa
              </Link>
            </div>

            <p className="source">{timeAgo(data!.updatedAt)} · Fuente: Ministerio (Geoportal de Gasolineras)</p>
          </>
        )}
      </div>

      {st && (
        <div className="action-bar">
          <Link href="/alertas/nueva" aria-label="Crear alerta de precio" className="btn soft square-56">
            <Icon name="bell" size={22} />
          </Link>
          <button type="button" className="btn primary big grow" onClick={() => goTo({ ...st, dist })}>
            <Icon name="navigate" size={20} stroke={2.4} />
            Cómo llegar
          </button>
        </div>
      )}
    </div>
  );
}
