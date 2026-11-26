"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brandStyle, LOGO_IMG, tileCss } from "@/lib/brands";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { carShows, ensureGarage, settingsStore, switchVehicle, useGarage, useMode, useSettings, useShows, vehicleName } from "@/lib/store";
import { Icon, type IconName } from "./Icon";

export function BrandTile({ brand, size = 40 }: { brand: string; size?: number }) {
  const b = brandStyle(brand);
  return (
    <span aria-hidden="true" style={tileCss(b, size)}>
      {b.logo ? <img src={b.logo} alt="" width={size} height={size} loading="lazy" decoding="async" style={LOGO_IMG} /> : b.mark}
    </span>
  );
}

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Cerca", icon: "pump", match: (p) => p === "/" || p.startsWith("/gasolinera") || p.startsWith("/carga") },
  { href: "/mapa", label: "Mapa", icon: "map", match: (p) => p.startsWith("/mapa") },
  { href: "/ruta", label: "Ruta", icon: "route", match: (p) => p.startsWith("/ruta") },
  { href: "/favoritas", label: "Favoritas", icon: "star", match: (p) => p.startsWith("/favoritas") },
  { href: "/alertas", label: "Alertas", icon: "bell", match: (p) => p.startsWith("/alertas") },
];

export function BottomNav() {
  const path = usePathname() || "/";
  const [mode] = useMode();
  return (
    <nav aria-label="Principal" className="bottom-nav">
      {TABS.map((t) => {
        const on = t.match(path);
        const href = t.href === "/" && mode === "charge" ? "/carga" : t.href;
        return (
          <Link key={t.href} href={href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>
            <Icon name={t.icon} size={24} stroke={on ? 2.2 : 2} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const CAR_LABEL: Record<string, string> = { gas: "Gasolina", diesel: "Diésel", glp: "GLP / gas", phev: "Híbrido enchufable", ev: "Eléctrico" };

export function ModeTabs({ mode }: { mode: "fuel" | "charge" }) {
  const shows = useShows();
  const [settings] = useSettings();
  const [pick, setPick] = useState(false);
  const both = shows.fuel && shows.charge;
  const name = settings.configured ? vehicleName(settings.carName, settings.carType) : "Mi vehículo";
  return (
    <div className="mode-row">
      {both ? (
        <div role="tablist" aria-label="Modo" className="mode-tabs">
          <Link href="/" role="tab" aria-selected={mode === "fuel"} className={mode === "fuel" ? "on" : undefined}>
            <Icon name="pump" size={16} stroke={2.4} color={mode === "fuel" ? "#0B7A43" : "currentColor"} />
            Combustible
          </Link>
          <Link href="/carga" role="tab" aria-selected={mode === "charge"} className={mode === "charge" ? "on" : undefined}>
            <Icon name="bolt" size={16} stroke={mode === "charge" ? 1.6 : 2.2} fill={mode === "charge" ? "#1F4FD1" : "none"} color={mode === "charge" ? "#1F4FD1" : "currentColor"} />
            Carga
          </Link>
        </div>
      ) : (
        // Vehículo de un solo tipo: no hay nada que elegir entre gasolina y carga; se enseña el vehículo en uso
        <button type="button" className="car-pill" onClick={() => setPick(true)} aria-label={`Vehículo: ${name}. Cambiar de vehículo`}>
          <Icon name="car" size={20} stroke={2} />
          <span className="col-2 grow min0">
            <span className="b14 ellipsis">{name}</span>
            <span className="muted b12">{CAR_LABEL[settings.carType] ?? ""}</span>
          </span>
          <Icon name="chevronDown" size={18} color="#5B6675" />
        </button>
      )}
      {both && (
        <button type="button" aria-label={`Vehículo: ${name}. Cambiar de vehículo`} className="icon-btn square" onClick={() => setPick(true)}>
          <Icon name="car" size={22} stroke={2} />
        </button>
      )}
      <VehicleSheet open={pick} onClose={() => setPick(false)} />
      <Link href="/ajustes" aria-label="Ajustes" className="icon-btn square">
        <Icon name="settings" size={22} stroke={2} />
      </Link>
    </div>
  );
}

export function FuelChips({
  fuels,
  value,
  onChange,
}: {
  fuels: FuelKey[];
  value: FuelKey;
  onChange: (f: FuelKey) => void;
}) {
  return (
    <div className="chips scroll-x" role="group" aria-label="Combustible">
      {fuels.map((f) => (
        <button key={f} type="button" className={`chip${f === value ? " on" : ""}`} aria-pressed={f === value} onClick={() => onChange(f)}>
          {fuelByKey(f)?.chip ?? f}
        </button>
      ))}
    </div>
  );
}

/** Elegir el vehículo en uso, editarlo o añadir otro */
export function VehicleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const path = usePathname() || "/";
  const [garage] = useGarage();
  const [settings] = useSettings();
  useEffect(() => {
    if (open) ensureGarage();
  }, [open]);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const choose = (id: string) => {
    switchVehicle(id);
    onClose();
    // si el vehículo nuevo no usa lo que se está viendo (gasolina o carga), se va a lo suyo
    const sh = carShows(settingsStore.get());
    if (path === "/carga" && !sh.charge) router.replace("/");
    else if (path === "/" && !sh.fuel) router.replace("/carga");
  };
  return (
    <Sheet open={open} onClose={onClose} label="Elegir vehículo">
      <div className="stack-14">
        <h2 className="h-sheet">Tus vehículos</h2>
        {garage.list.length > 0 ? (
          <div className="card set-list" role="radiogroup" aria-label="Vehículo en uso">
            {garage.list.map((v) => {
              const on = v.id === garage.active;
              return (
                <button key={v.id} type="button" role="radio" aria-checked={on} className="set-link veh-row" onClick={() => choose(v.id)}>
                  <span className={`veh-dot${on ? " on" : ""}`} aria-hidden="true" />
                  <span className="col-2 grow min0">
                    <span className="b15 ellipsis">{v.name}</span>
                    <span className="muted b12">
                      {CAR_LABEL[v.carType] ?? ""}
                      {v.carType !== "ev" ? ` · ${v.tank} L` : ` · ${v.battery} kWh`}
                    </span>
                  </span>
                  {on && <span className="b12 green">En uso</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="muted b14">Aún no has guardado ningún vehículo. Guarda el tuyo y, si tienes más (una moto, otro coche…), añádelos para cambiar con un toque.</span>
        )}
        <div className="stack-8">
          {settings.configured && (
            <button type="button" className="btn soft" onClick={() => go("/mi-coche")}>
              <Icon name="settings" size={18} /> Editar {vehicleName(settings.carName, settings.carType)}
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => go(settings.configured ? "/mi-coche?nuevo=1" : "/mi-coche")}>
            <Icon name="plus" size={18} stroke={2.6} /> {settings.configured ? "Añadir otro vehículo" : "Guardar mi vehículo"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Hoja inferior modal accesible (Escape para cerrar, foco al abrir) */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="sheet">
        <span aria-hidden="true" className="sheet-grip" />
        {children}
      </div>
    </div>
  );
}

export function Stepper({
  value,
  unit,
  onChange,
  min,
  max,
  labelLess,
  labelMore,
}: {
  value: number;
  unit: string;
  onChange: (n: number) => void;
  min: number;
  max: number;
  labelLess: string;
  labelMore: string;
}) {
  return (
    <span className="stepper">
      <button type="button" aria-label={labelLess} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="stepper-val">
        {value} {unit}
      </span>
      <button type="button" aria-label={labelMore} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </span>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="card empty">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <strong>{title}</strong>
      <span className="muted">{text}</span>
      {children}
    </div>
  );
}

export function Skeleton({ h = 64, r = 18 }: { h?: number; r?: number }) {
  return <div className="skeleton" style={{ height: h, borderRadius: r }} />;
}
