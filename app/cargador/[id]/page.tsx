import type { Metadata } from "next";
import { ChargerDetail } from "@/components/screens/ChargerDetail";

export const metadata: Metadata = { title: "Punto de recarga" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChargerDetail id={id} />;
}
