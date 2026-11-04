import type { Metadata } from "next";
import { StationDetail } from "@/components/screens/StationDetail";

export const metadata: Metadata = { title: "Ficha de la gasolinera" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const { id } = await params;
  const { m } = await searchParams;
  return <StationDetail id={id} m={m ?? null} />;
}
