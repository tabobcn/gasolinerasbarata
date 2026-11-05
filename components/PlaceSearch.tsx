"use client";

import { useEffect, useId, useState } from "react";
import type { Place } from "@/lib/types";
import { getJSON } from "@/lib/useJSON";
import { Icon, LocateIcon } from "./Icon";

/** Caja de búsqueda de sitios/direcciones con sugerencias */
export function PlaceSearch({
  onPick,
  onUseGps,
  placeholder = "Buscar zona o dirección",
  autoFocus,
  label = "Buscar zona o dirección",
}: {
  onPick: (p: Place) => void;
  onUseGps?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      getJSON<{ places: Place[] }>(`/api/places?q=${encodeURIComponent(term)}`)
        .then((r) => {
          if (!alive) return;
          setResults(r.places);
          setError(r.places.length ? null : "No encontramos ese sitio en España");
        })
        .catch(() => alive && setError("El buscador no responde ahora mismo"))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="stack-8">
      <label className="search-box" htmlFor={id}>
        <Icon name="search" size={20} color="#5B6675" />
        <span className="sr-only">{label}</span>
        <input
          id={id}
          type="search"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <ul className="suggestions" aria-live="polite">
        {onUseGps && (
          <li>
            <button type="button" onClick={onUseGps}>
              <LocateIcon size={20} />
              <span className="col-2">
                <span className="b15">Usar mi ubicación</span>
                <span className="muted xs">GPS del móvil</span>
              </span>
            </button>
          </li>
        )}
        {results.map((p) => (
          <li key={`${p.lat},${p.lon}`}>
            <button type="button" onClick={() => onPick(p)}>
              <Icon name="pin" size={20} color="#5B6675" />
              <span className="col-2 min0">
                <span className="b15 ellipsis">{p.label}</span>
                {p.detail && <span className="muted xs ellipsis">{p.detail}</span>}
              </span>
            </button>
          </li>
        ))}
        {loading && <li className="muted sm pad">Buscando…</li>}
        {!loading && error && <li className="muted sm pad">{error}</li>}
      </ul>
    </div>
  );
}
