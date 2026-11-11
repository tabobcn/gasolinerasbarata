"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { brandStyle, LOGO_IMG, tileCss } from "@/lib/brands";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { useMode } from "@/lib/store";
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

export function ModeTabs({ mode }: { mode: "fuel" | "charge" }) {
  return (
    <div className="mode-row">
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
      <Link href="/mi-coche" aria-label="Mi coche" className="icon-btn square">
        <Icon name="car" size={22} stroke={2} />
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
