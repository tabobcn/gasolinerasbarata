"use client";

import { useState } from "react";
import { useLocation } from "./LocationProvider";
import { PlaceSearch } from "./PlaceSearch";
import { usePlaces } from "@/lib/store";

/** Buscador grande siempre a la vista: solo en ordenador, donde la ubicación automática suele fallar */
export function DeskSearch({ title }: { title: string }) {
  const { locate, setPlace } = useLocation();
  const [places] = usePlaces();
  const [k, setK] = useState(0);
  return (
    <div className="desk-search">
      <h2 className="desk-title">{title}</h2>
      <PlaceSearch
        key={k}
        placeholder="Ciudad, código postal o dirección"
        label="Ciudad, código postal o dirección"
        onUseGps={locate}
        onPick={(p) => {
          setPlace({ lat: p.lat, lon: p.lon, label: p.label });
          setK((n) => n + 1);
        }}
      />
      {places.length > 0 && (
        <div className="chips wrap">
          {places.map((p) => (
            <button key={p.id} type="button" className="chip" onClick={() => setPlace({ lat: p.lat, lon: p.lon, label: p.label })}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
