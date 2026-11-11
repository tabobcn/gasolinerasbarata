"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BottomNav, BrandTile, Sheet } from "../ui";
import { Icon } from "../Icon";
import { refuelsStore, useRefuels, useSettings, type Refuel } from "@/lib/store";
import { FUELS, fuelByKey, isFuelKey, type FuelKey } from "@/lib/fuels";
import { fmtEuros, fmtKm, fmtPrice, madridDate } from "@/lib/format";
import { useLocation } from "../LocationProvider";
import { stationsUrl, useJSON } from "@/lib/useJSON";
import type { Station, StationsResponse } from "@/lib/types";
import { useDiscounts } from "@/lib/discountStore";
import { applyDiscounts } from "@/lib/discounts";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const num = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};
const dec = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
};

type Form = { id?: string; date: string; name: string; brand: string; stationId?: string; munId?: string; fuel: FuelKey; liters: string; price: string; total: string; km: string };

export function Refuels() {
  const [list] = useRefuels();
  const [settings] = useSettings();
  const today = madridDate(new Date());
  const [form, setForm] = useState<Form | null>(null);
  const [last, setLast] = useState<"liters" | "total">("total"); // qué se calcula solo

  const { loc, locate, status } = useLocation();
  const [disc] = useDiscounts();
  const [more, setMore] = useState(false);
  // Gasolineras cercanas para elegir sin escribir (solo se piden con el formulario abierto)
  const near = useJSON<StationsResponse>(form && !form.id && loc ? stationsUrl(loc.lat, loc.lon, 5) : null);
  const nearList = useMemo(() => {
    if (!near.data || !form) return [];
    const q = form.stationId ? "" : form.name.trim().toLowerCase();
    return applyDiscounts(near.data.stations, disc)
      .filter((st) => !q || st.name.toLowerCase().includes(q) || st.brand.toLowerCase().includes(q))
      .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
  }, [near.data, disc, form?.name, form?.stationId]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked: Station | undefined = form?.stationId && near.data ? applyDiscounts(near.data.stations, disc).find((st) => st.id === form.stationId) : undefined;

  const pick = (st: Station) => {
    const p = st.prices[form!.fuel];
    set({ name: st.name, brand: st.brand, stationId: st.id, munId: st.munId, ...(p != null ? { price: dec(p, 3) } : {}) }, p != null ? "price" : undefined);
  };
  const pickFuel = (f: FuelKey) => {
    const p = picked?.prices[f];
    set({ fuel: f, ...(p != null ? { price: dec(p, 3) } : {}) }, p != null ? "price" : undefined);
  };
  const edit = (r: Refuel) =>
    setForm({ id: r.id, date: r.date, name: r.name, brand: r.brand, stationId: r.stationId, munId: r.munId, fuel: r.fuel, liters: dec(r.liters), price: dec(r.price, 3), total: dec(r.total), km: r.km != null ? String(Math.round(r.km)) : "" });
  const remove = (id: string) => refuelsStore.set((l) => l.filter((x) => x.id !== id));

  const blank = (): Form => ({ date: today, name: "", brand: "", fuel: settings.fuel, liters: "", price: "", total: "", km: "" });

  // Desde la ficha de una gasolinera: /repostajes?nuevo=1&id=…&nombre=…&marca=…&fuel=…&precio=…
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("nuevo") !== "1") return;
    const f = sp.get("fuel");
    const price = num(sp.get("precio") ?? "");
    setForm({
      ...blank(),
      name: (sp.get("nombre") ?? "").slice(0, 80),
      brand: (sp.get("marca") ?? "").slice(0, 60),
      stationId: sp.get("id")?.slice(0, 12) || undefined,
      munId: sp.get("m")?.slice(0, 8) || undefined,
      fuel: isFuelKey(f) ? f : settings.fuel,
      price: price ? dec(price, 3) : "",
    });
    window.history.replaceState(null, "", "/repostajes");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Form>, edited?: "liters" | "price" | "total") =>
    setForm((f) => {
      if (!f) return f;
      const n = { ...f, ...patch };
      const l = num(n.liters);
      const p = num(n.price);
      const t = num(n.total);
      // Con dos de los tres datos se calcula el tercero
      if (edited === "liters" && l && p) return (setLast("total"), { ...n, total: dec(l * p) });
      if (edited === "total" && t && p) return (setLast("liters"), { ...n, liters: dec(t / p) });
      if (edited === "price" && p) {
        if (last === "total" && l) return { ...n, total: dec(l * p) };
        if (t) return { ...n, liters: dec(t / p) };
        if (l) return { ...n, total: dec(l * p) };
      }
      return n;
    });

  const fl = form ? num(form.liters) : null;
  const fp = form ? num(form.price) : null;
  const ft = form ? num(form.total) : null;
  const valid = !!(form && form.date && fl && fp && ft && fl < 500 && fp < 10);

  const save = () => {
    if (!form || !valid) return;
    const r: Refuel = {
      id: form.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      date: form.date,
      name: form.name.trim() || "Gasolinera",
      brand: form.brand.trim() || form.name.trim() || "Gasolinera",
      stationId: form.stationId,
      munId: form.munId,
      fuel: form.fuel,
      liters: fl!,
      price: fp!,
      total: ft!,
      km: num(form.km) ?? undefined,
    };
    refuelsStore.set((l) => [...l.filter((x) => x.id !== r.id), r].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 500));
    setForm(null);
  };

  const sum = useMemo(() => {
    if (!list.length) return null;
    const ym = today.slice(0, 7);
    const month = list.filter((r) => r.date.startsWith(ym));
    const tot = (xs: Refuel[]) => xs.reduce((a, r) => a + r.total, 0);
    const lit = (xs: Refuel[]) => xs.reduce((a, r) => a + r.liters, 0);
    // últimos 6 meses
    const [y, m] = ym.split("-").map(Number);
    const bars = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(y, m - 1 - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: MONTHS[d.getMonth()], total: tot(list.filter((r) => r.date.startsWith(key))) };
    });
    const max = Math.max(...bars.map((b) => b.total), 1);
    // consumo real: entre el primer y el último repostaje con kilómetros, sin contar los litros del primero
    const withKm = list.filter((r) => r.km != null).sort((a, b) => a.km! - b.km!);
    let cons: number | null = null;
    if (withKm.length >= 2) {
      const km = withKm[withKm.length - 1].km! - withKm[0].km!;
      const l = lit(withKm.slice(1));
      if (km >= 50) cons = (l / km) * 100;
    }
    // dónde repostas más
    const by = new Map<string, number>();
    list.forEach((r) => by.set(r.name, (by.get(r.name) ?? 0) + 1));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      monthName: MONTHS_LONG[m - 1],
      monthTotal: tot(month),
      monthCount: month.length,
      monthLiters: lit(month),
      avgPrice: lit(list) > 0 ? tot(list) / lit(list) : null,
      all: tot(list),
      count: list.length,
      bars: bars.map((b) => ({ ...b, h: b.total > 0 ? Math.max(6, (b.total / max) * 100) : 2, current: b.key === ym })),
      cons,
      top: top && list.length >= 3 ? top : null,
    };
  }, [list, today]);

  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top">
        <div className="row-between">
          <h1 className="h1">Mis repostajes</h1>
          <button type="button" className="btn primary small" onClick={() => setForm(blank())}>
            <Icon name="plus" size={16} stroke={2.6} /> Apuntar
          </button>
        </div>

        {!sum && (
          <div className="card empty">
            <span className="empty-icon">
              <Icon name="pump" size={24} />
            </span>
            <strong>Lleva la cuenta de lo que gastas</strong>
            <span className="muted">Apunta cada repostaje y verás cuánto gastas al mes, a qué precio medio pagas el litro y cuánto consume tu coche. Es opcional y se guarda solo en tu móvil.</span>
            <button type="button" className="btn primary" onClick={() => setForm(blank())}>
              <Icon name="plus" size={18} /> Apuntar mi primer repostaje
            </button>
          </div>
        )}

        {sum && (
          <>
            <section className="card hero rf-hero" aria-label={`Resumen de ${sum.monthName}`}>
              <span className="eyebrow green">GASTO DE {sum.monthName.toUpperCase()}</span>
              <span className="big-price green">
                <span className="num">{fmtEuros(sum.monthTotal)}</span>
                <span className="unit">€</span>
              </span>
              <span className="muted b13">
                {sum.monthCount === 0 ? "Aún no has apuntado nada este mes" : `${sum.monthCount} ${sum.monthCount === 1 ? "repostaje" : "repostajes"} · ${dec(sum.monthLiters, 1)} litros`}
              </span>
              <div className="rf-bars" role="img" aria-label="Gasto de los últimos seis meses">
                {sum.bars.map((b) => (
                  <span key={b.key} className="rf-bar-col" title={`${b.label}: ${fmtEuros(b.total)} €`}>
                    <span className="rf-bar-val">{b.total > 0 ? Math.round(b.total) : ""}</span>
                    <span className={`rf-bar${b.current ? " on" : ""}`} style={{ height: `${b.h}%` }} />
                    <span className="rf-bar-lab">{b.label}</span>
                  </span>
                ))}
              </div>
            </section>

            <div className="rf-stats">
              <div className="card rf-stat">
                <span className="muted b12">Precio medio pagado</span>
                <strong>{sum.avgPrice != null ? `${fmtPrice(sum.avgPrice)} €/l` : "—"}</strong>
              </div>
              <div className="card rf-stat">
                <span className="muted b12">Consumo real</span>
                <strong>{sum.cons != null ? `${dec(sum.cons, 1)} l/100 km` : "—"}</strong>
                {sum.cons == null && <span className="muted xs">Apunta los km en dos repostajes</span>}
              </div>
              <div className="card rf-stat">
                <span className="muted b12">Total apuntado</span>
                <strong>{fmtEuros(sum.all)} €</strong>
                <span className="muted xs">
                  {sum.count} {sum.count === 1 ? "repostaje" : "repostajes"}
                </span>
              </div>
              {sum.top && (
                <div className="card rf-stat">
                  <span className="muted b12">Donde más repostas</span>
                  <strong className="ellipsis">{sum.top[0]}</strong>
                  <span className="muted xs">{sum.top[1]} veces</span>
                </div>
              )}
            </div>

            <h2 className="h2">Historial</h2>
            <div className="stack-8">
              {list.map((r) => (
                <div key={r.id} className="row-card rf-row">
                  <BrandTile brand={r.brand} size={40} />
                  <span className="col-2 grow min0">
                    <span className="b15 ellipsis">{r.name}</span>
                    <span className="muted b12">
                      {dayText(r.date)} · {fuelByKey(r.fuel)?.chip} · {dec(r.liters, 1)} l a {fmtPrice(r.price)} €{r.km != null ? ` · ${Math.round(r.km).toLocaleString("es-ES")} km` : ""}
                    </span>
                  </span>
                  <strong className="b16 nowrap">{fmtEuros(r.total)} €</strong>
                  <button type="button" className="mini-btn" aria-label={`Modificar el repostaje del ${dayText(r.date)}`} onClick={() => edit(r)}>
                    Editar
                  </button>
                </div>
              ))}
            </div>
            <p className="source">
              Tus repostajes se guardan solo en este navegador; nosotros no los vemos. <Link href="/privacidad">Fuentes y privacidad</Link>
            </p>
          </>
        )}
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)} label="Apuntar repostaje">
        {form && (
          <div className="stack-14">
            <h2 className="h-sheet">{form.id ? "Modificar repostaje" : "Apuntar repostaje"}</h2>
            <div className="rf-form">
              <label className="rf-field wide">
                <span>Gasolinera{!form.id && loc ? " (escribe para buscar entre las cercanas)" : ""}</span>
                <input type="text" maxLength={80} placeholder="Por ejemplo: Plenergy L'Hospitalet" value={form.name} onChange={(e) => set({ name: e.target.value, stationId: undefined, munId: undefined, brand: "" })} />
              </label>
              {!form.id && !form.stationId && (
                <div className="rf-near wide">
                  {!loc && (
                    <button type="button" className="btn soft small" onClick={locate} disabled={status === "locating"}>
                      <Icon name="pin" size={16} /> {status === "locating" ? "Buscando…" : "Elegir entre las gasolineras cercanas"}
                    </button>
                  )}
                  {loc && near.loading && !near.data && <span className="muted b12">Buscando gasolineras cercanas…</span>}
                  {nearList.slice(0, more ? 12 : 4).map((st) => (
                    <button key={st.id} type="button" className="rf-pick" onClick={() => pick(st)}>
                      <BrandTile brand={st.brand} size={32} />
                      <span className="col-2 grow min0">
                        <span className="b14 ellipsis">{st.name}</span>
                        <span className="muted xs ellipsis">
                          {fmtKm(st.dist)} · {st.address}
                        </span>
                      </span>
                      <strong className="b14 nowrap">{st.prices[form.fuel] != null ? `${fmtPrice(st.prices[form.fuel])} €` : "—"}</strong>
                    </button>
                  ))}
                  {loc && near.data && nearList.length === 0 && <span className="muted b12">Ninguna cercana con ese nombre: se guardará tal como lo has escrito.</span>}
                  {!more && nearList.length > 4 && (
                    <button type="button" className="link-btn" onClick={() => setMore(true)}>
                      Ver más cercanas
                    </button>
                  )}
                </div>
              )}
              <label className="rf-field">
                <span>Fecha</span>
                <input type="date" max={today} value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label className="rf-field">
                <span>Precio por litro (€)</span>
                <input type="text" inputMode="decimal" placeholder="1,459" value={form.price} onChange={(e) => set({ price: e.target.value }, "price")} />
              </label>
              <label className="rf-field">
                <span>Importe (€)</span>
                <input type="text" inputMode="decimal" placeholder="50,00" value={form.total} onChange={(e) => set({ total: e.target.value }, "total")} />
              </label>
              <label className="rf-field">
                <span>Litros</span>
                <input type="text" inputMode="decimal" placeholder="34,27" value={form.liters} onChange={(e) => set({ liters: e.target.value }, "liters")} />
              </label>
              <label className="rf-field wide">
                <span>Kilómetros del coche (opcional, para calcular el consumo)</span>
                <input type="text" inputMode="numeric" placeholder="45.200" value={form.km} onChange={(e) => set({ km: e.target.value.replace(/[^\d]/g, "") })} />
              </label>
            </div>
            <div className="chips wrap" role="group" aria-label="Combustible">
              {FUELS.filter((f) => settings.fuels.includes(f.key) || f.key === form.fuel).map((f) => (
                <button key={f.key} type="button" className={`chip${f.key === form.fuel ? " on" : ""}`} aria-pressed={f.key === form.fuel} onClick={() => pickFuel(f.key)}>
                  {f.chip}
                </button>
              ))}
            </div>
            <span className="muted b12">Escribe el precio y el importe (o los litros): el otro dato se calcula solo.</span>
            <button type="button" className="btn primary big" disabled={!valid} onClick={save}>
              {form.id ? "Guardar cambios" : "Guardar repostaje"}
            </button>
            {form.id && (
              <button type="button" className="btn soft danger" onClick={() => (remove(form.id!), setForm(null))}>
                <Icon name="trash" size={18} /> Borrar este repostaje
              </button>
            )}
          </div>
        )}
      </Sheet>
      <BottomNav />
    </div>
  );
}
