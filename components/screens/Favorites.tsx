"use client";

import Link from "next/link";
import { useState } from "react";
import { BottomNav, BrandTile, EmptyState, Sheet, Skeleton } from "../ui";
import { Icon } from "../Icon";
import { PlaceSearch } from "../PlaceSearch";
import { stationHref } from "../StationRow";
import { favoritesStore, placesStore, uid, useFavorites, usePlaces, useSettings, type SavedPlace } from "@/lib/store";
import { stationsUrl, useJSON } from "@/lib/useJSON";
import type { Prices, Station, StationsResponse } from "@/lib/types";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { fmtPrice, signedCents } from "@/lib/format";

function PlaceCard({ p, fuel }: { p: SavedPlace; fuel: FuelKey }) {
  const { data, loading } = useJSON<StationsResponse>(stationsUrl(p.lat, p.lon, 5));
  const cheapest = data?.stations.filter((s) => s.prices[fuel] != null).sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)[0];
  const icon = p.kind === "casa" ? "home" : p.kind === "trabajo" ? "briefcase" : "pin";
  return (
    <div className="place-card">
      <Link href={cheapest ? stationHref(cheapest) : "#"} className="place-main">
        <span className="soft-icon green" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        <span className="col-2 grow min0">
          <span className="b15">{p.label}</span>
          <span className="muted xs ellipsis">{p.detail} · 5 km</span>
        </span>
        <span className="col-2 end">
          <span className="muted xs">Más barata ahora</span>
          <span className="price-sm green">{loading && !data ? "…" : cheapest ? `${fmtPrice(cheapest.prices[fuel])} €` : "—"}</span>
        </span>
      </Link>
      <div className="place-actions">
        <Link href={`/alertas/nueva?zone=${p.id}`} className="mini-btn">
          <Icon name="bell" size={14} /> Alerta
        </Link>
        <button type="button" className="mini-btn" onClick={() => placesStore.set((list) => list.filter((x) => x.id !== p.id))} aria-label={`Quitar ${p.label}`}>
          <Icon name="trash" size={14} /> Quitar
        </button>
      </div>
    </div>
  );
}

export function Favorites() {
  const [settings] = useSettings();
  const [favs] = useFavorites();
  const [places] = usePlaces();
  const fuel = settings.fuel;
  const [adding, setAdding] = useState<null | SavedPlace["kind"]>(null);
  const [kindPick, setKindPick] = useState(false);
  const [customName, setCustomName] = useState("");

  const items = favs.map((f) => `${f.id}:${f.m}`).join(",");
  const lookup = useJSON<{ items: { station: Station; yesterday: Prices | null }[] }>(favs.length ? `/api/stations/lookup?items=${items}` : null);

  const hasCasa = places.some((p) => p.kind === "casa");
  const hasTrabajo = places.some((p) => p.kind === "trabajo");

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top">
        <h1 className="h1 big">Favoritas</h1>

        <h2 className="eyebrow">MIS SITIOS</h2>
        <div className="stack-8">
          {places.map((p) => (
            <PlaceCard key={p.id} p={p} fuel={fuel} />
          ))}
          {!places.length && <p className="muted sm">Guarda Casa o Trabajo para ver de un vistazo la gasolinera más barata de cada sitio.</p>}
        </div>
        <button type="button" className="btn dashed" onClick={() => setKindPick(true)}>
          <Icon name="plus" size={18} stroke={2.6} /> Añadir sitio
        </button>

        <h2 className="eyebrow">GASOLINERAS GUARDADAS · {fuelByKey(fuel)?.label.toUpperCase()}</h2>
        {!favs.length && (
          <EmptyState icon="star" title="Aún no tienes favoritas" text="Toca la estrella en la ficha de una gasolinera para guardarla aquí." />
        )}
        {favs.length > 0 && lookup.loading && !lookup.data && favs.map((f) => <Skeleton key={f.id} />)}
        {lookup.data && (
          <div className="stack-8">
            {favs.map((f) => {
              const it = lookup.data!.items.find((x) => x.station.id === f.id);
              const now = it?.station.prices[fuel];
              const before = it?.yesterday?.[fuel];
              const change = now != null && before != null ? now - before : null;
              const changeTxt =
                change == null ? "Sin datos de ayer" : Math.abs(change) < 0.0005 ? "Sin cambios desde ayer" : `${change < 0 ? "Ha bajado" : "Ha subido"} ${signedCents(change).replace(/^[+−]/, "")} desde ayer`;
              return (
                <div key={f.id} className="fav-row">
                  <Link href={it ? stationHref(it.station) : `/gasolinera/${f.id}?m=${f.m}`} className="row-12 grow min0 plain">
                    <BrandTile brand={f.brand} size={40} />
                    <span className="col-2 grow min0">
                      <span className="b15 ellipsis">{f.name}</span>
                      <span className={`b12 ${change != null && change < -0.0005 ? "green" : change != null && change > 0.0005 ? "red" : "muted"}`}>
                        {now == null ? `No vende ${fuelByKey(fuel)?.label.toLowerCase()}` : changeTxt}
                      </span>
                    </span>
                    <span className="price-sm">{now != null ? `${fmtPrice(now)} €` : "—"}</span>
                  </Link>
                  <button
                    type="button"
                    className="icon-btn ghost"
                    aria-label={`Quitar ${f.name} de favoritas`}
                    onClick={() => favoritesStore.set((list) => list.filter((x) => x.id !== f.id))}
                  >
                    <Icon name="x" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={kindPick} onClose={() => setKindPick(false)} label="Añadir sitio">
        <div className="stack-12">
          <h2 className="h-sheet">¿Qué sitio quieres guardar?</h2>
          <div className="grid-2">
            <button type="button" className="kind-btn" disabled={hasCasa} onClick={() => (setKindPick(false), setAdding("casa"))}>
              <Icon name="home" size={22} /> Casa
            </button>
            <button type="button" className="kind-btn" disabled={hasTrabajo} onClick={() => (setKindPick(false), setAdding("trabajo"))}>
              <Icon name="briefcase" size={22} /> Trabajo
            </button>
          </div>
          <label className="field">
            <span className="b13">Otro sitio</span>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ej.: Casa de mis padres" />
          </label>
          <button type="button" className="btn soft" disabled={!customName.trim()} onClick={() => (setKindPick(false), setAdding("otro"))}>
            Continuar
          </button>
        </div>
      </Sheet>

      <Sheet open={!!adding} onClose={() => setAdding(null)} label="Buscar dirección del sitio">
        <div className="stack-12">
          <h2 className="h-sheet">¿Dónde está {adding === "casa" ? "tu casa" : adding === "trabajo" ? "tu trabajo" : customName}?</h2>
          <PlaceSearch
            autoFocus
            placeholder="Calle, barrio o municipio"
            onPick={(pl) => {
              const label = adding === "casa" ? "Casa" : adding === "trabajo" ? "Trabajo" : customName.trim();
              placesStore.set((list) => [...list, { id: uid(), kind: adding!, label, detail: pl.detail ? `${pl.label}, ${pl.detail.split(",")[0]}` : pl.label, lat: pl.lat, lon: pl.lon }]);
              setAdding(null);
              setCustomName("");
            }}
          />
        </div>
      </Sheet>
      <BottomNav />
    </div>
  );
}
