"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "../Icon";
import { BottomNav } from "../ui";
import { CAR_TYPES } from "../CarForm";
import { knownBrandList, OTHER_BRANDS } from "@/lib/brands";
import { useSettings, type NavApp } from "@/lib/store";

const RADII = [2, 5, 10, 20];
const NAVS: { id: NavApp | null; label: string }[] = [
  { id: null, label: "Preguntar" },
  { id: "maps", label: "Google Maps" },
  { id: "waze", label: "Waze" },
];
const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/descuentos", label: "Mis descuentos", icon: "card" },
  { href: "/repostajes", label: "Mis repostajes", icon: "trendDown" },
  { href: "/instalar", label: "Instalar la app y avisos", icon: "bell" },
  { href: "/privacidad", label: "Fuentes y privacidad", icon: "info" },
];
const BRANDS = [...knownBrandList(), { key: OTHER_BRANDS, name: "Otras (low cost e independientes)" }];

export function SettingsScreen() {
  const router = useRouter();
  const [s, setS] = useSettings();
  const hidden = s.hiddenBrands ?? [];
  const only = s.onlyBrands ?? [];
  // Dos formas de elegir: quitar las que no quieres, o quedarte solo con las que quieres
  const [picked, setOnlyMode] = useState<boolean | null>(null);
  const onlyMode = picked ?? only.length > 0; // si no ha tocado nada, manda lo que tenga guardado
  const list = onlyMode ? only : hidden;
  const field = onlyMode ? "onlyBrands" : "hiddenBrands";
  const toggleBrand = (key: string) => setS((p) => ({ ...p, [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] }));
  const setMode = (m: boolean) => {
    setOnlyMode(m);
    // al cambiar de forma se empieza de cero, para que no se mezclen las dos listas
    setS((p) => ({ ...p, hiddenBrands: [], onlyBrands: [] }));
  };
  const typeLabel = CAR_TYPES.find((t) => t.id === s.carType)?.label ?? "";
  // Un híbrido enchufable ya lo ve todo; a los demás se les deja ver también la otra parte
  const canShowAll = !!s.configured && s.carType !== "phev";
  const other = s.carType === "ev" ? "gasolineras" : "cargadores";

  return (
    <div className="screen with-nav">
      <div className="stack-14 pad-x top">
        <div className="row-12">
          <button type="button" aria-label="Volver" className="icon-btn round" onClick={() => router.back()}>
            <Icon name="back" size={20} stroke={2.4} />
          </button>
          <h1 className="h1">Ajustes</h1>
        </div>

        <section className="card set-list">
          <Link href="/mi-coche" className="set-link">
            <Icon name="car" size={20} />
            <span className="col-2 grow min0">
              <span className="b15 ellipsis">{s.carName?.trim() || "Mi coche"}</span>
              <span className="muted b12">{s.configured ? typeLabel : "Dinos qué coche llevas"}</span>
            </span>
            <Icon name="chevronRight" size={18} color="#5B6675" />
          </Link>
          {canShowAll && (
            <div className="set-link">
              <Icon name={s.carType === "ev" ? "pump" : "bolt"} size={20} />
              <span className="col-2 grow min0">
                <span className="b15">Ver también {other}</span>
                <span className="muted b12">Aunque tu coche no los use</span>
              </span>
              <button type="button" role="switch" aria-checked={!!s.showAll} aria-label={`Ver también ${other}`} className={`switch-btn${s.showAll ? " on" : ""}`} onClick={() => setS((p) => ({ ...p, showAll: !p.showAll }))}>
                <span aria-hidden="true" />
              </button>
            </div>
          )}
        </section>

        <section className="card stack-10">
          <h2 className="eyebrow">DISTANCIA DE BÚSQUEDA</h2>
          <div className="grid-4">
            {RADII.map((r) => (
              <button key={r} type="button" aria-pressed={s.radius === r} className={`opt small${s.radius === r ? " on" : ""}`} onClick={() => setS((p) => ({ ...p, radius: r }))}>
                {r} km
              </button>
            ))}
          </div>
        </section>

        <section className="card stack-10">
          <h2 className="eyebrow">APP PARA IR A LA GASOLINERA</h2>
          <div className="grid-3">
            {NAVS.map(({ id, label }) => (
              <button key={label} type="button" aria-pressed={s.navApp === id} className={`opt small${s.navApp === id ? " on" : ""}`} onClick={() => setS((p) => ({ ...p, navApp: id }))}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack-10">
          <h2 className="eyebrow">MARCAS</h2>
          <div className="grid-2">
            <button type="button" aria-pressed={!onlyMode} className={`opt small${!onlyMode ? " on" : ""}`} onClick={() => onlyMode && setMode(false)}>
              Ocultar algunas
            </button>
            <button type="button" aria-pressed={onlyMode} className={`opt small${onlyMode ? " on" : ""}`} onClick={() => !onlyMode && setMode(true)}>
              Ver solo las que elija
            </button>
          </div>
          <span className="muted b13">
            {onlyMode
              ? only.length
                ? `Solo ves ${only.length === 1 ? "esta marca" : `estas ${only.length} marcas`} en la lista, el mapa y la ruta.`
                : "Toca las marcas donde repostas (por ejemplo, solo Repsol). Mientras no elijas ninguna, se ven todas."
              : hidden.length
                ? `Ocultas: ${hidden.length}. No salen en la lista, el mapa ni la ruta.`
                : "Toca las marcas donde no repostas y dejarán de salir en la lista, el mapa y la ruta."}
          </span>
          <div className="chips wrap">
            {BRANDS.map((b) => (
              <button key={b.key} type="button" aria-pressed={list.includes(b.key)} className={`opt${onlyMode ? " pick" : " hide"}${list.includes(b.key) ? " on" : ""}`} onClick={() => toggleBrand(b.key)}>
                {b.name}
              </button>
            ))}
          </div>
          {list.length > 0 && (
            <button type="button" className="btn soft" onClick={() => setS((p) => ({ ...p, hiddenBrands: [], onlyBrands: [] }))}>
              Volver a ver todas
            </button>
          )}
        </section>

        <section className="card set-list">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="set-link">
              <Icon name={l.icon} size={20} />
              <span className="b15 grow">{l.label}</span>
              <Icon name="chevronRight" size={18} color="#5B6675" />
            </Link>
          ))}
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
