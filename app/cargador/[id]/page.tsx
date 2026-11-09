import type { Metadata } from "next";
import { ChargerDetail } from "@/components/screens/ChargerDetail";
import { rpc, validId } from "@/lib/supabase";
import { chargerName, groups, PLUG_LABEL, prettyAddress, prettyCity, type Car, type ChargerDetailResponse } from "@/lib/chargers";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string }> };

const ANY_CAR: Car = { electric: false, plugs: [], ac: 11, dc: 0, battery: 50, label: "coche" };

/** Título y descripción propios, para que al compartir el enlace se vea de qué cargador se trata */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const fallback: Metadata = { title: "Punto de recarga" };
  if (!validId(id)) return fallback;
  try {
    const r = await rpc<ChargerDetailResponse | null>("charger_detail", { p_id: id });
    const ch = r?.item;
    if (!ch) return fallback;
    const gs = groups(ch, ANY_CAR);
    const plugs = [...new Set(gs.map((g) => `${PLUG_LABEL[g.kind]} ${String(g.kw).replace(".", ",")} kW`))].slice(0, 3).join(", ");
    const prices = gs.map((g) => g.price).filter((p): p is number => p != null && p >= 0.15);
    const from = prices.length ? ` Desde ${Math.min(...prices).toFixed(2).replace(".", ",")} €/kWh.` : "";
    const where = [prettyAddress(ch.address), prettyCity(ch.city)].filter(Boolean).join(", ");
    const title = `${chargerName(ch)} · punto de recarga`;
    const description = `${where}. ${plugs}.${from} Precio, si funciona y si está libre ahora. Datos de Red Eléctrica (REVE).`;
    return { title, description };
  } catch {
    return fallback;
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { g } = await searchParams;
  return <ChargerDetail id={id} group={g ?? null} />;
}
