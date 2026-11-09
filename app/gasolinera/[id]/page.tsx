import type { Metadata } from "next";
import { StationDetail } from "@/components/screens/StationDetail";
import { municipalityStations } from "@/lib/ministry";
import { fuelByKey, type FuelKey } from "@/lib/fuels";
import { fmtPrice } from "@/lib/format";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> };

const SHOW: FuelKey[] = ["g95", "goa", "g98", "glp", "goap", "e10", "g95p", "gnc"];

/** Título y descripción propios, para que al compartir el enlace se vea qué gasolinera es y su precio */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { m } = await searchParams;
  const fallback: Metadata = { title: "Ficha de la gasolinera" };
  if (!/^\d{1,6}$/.test(id) || !m || !/^\d{1,5}$/.test(m)) return fallback;
  try {
    const st = (await municipalityStations(m)).stations.find((s) => s.id === id);
    if (!st) return fallback;
    const prices = SHOW.filter((f) => st.prices[f] != null).map((f) => `${fuelByKey(f)!.label} ${fmtPrice(st.prices[f])} €`);
    const title = prices.length ? `${st.name} · ${prices[0]}` : st.name;
    const where = [st.address, st.town || st.mun].filter(Boolean).join(", ");
    const description = `${where}. ${prices.slice(0, 4).join(" · ")}. Precios oficiales de hoy, horario y cómo llegar.`;
    return { title, description };
  } catch {
    return fallback;
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { m } = await searchParams;
  return <StationDetail id={id} m={m ?? null} />;
}
