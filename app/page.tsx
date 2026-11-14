import type { Metadata } from "next";
import { Home } from "@/components/screens/Home";

// Dirección canónica: la portada con ?lat=…&lon=… es la misma página para los buscadores
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Page() {
  return <Home />;
}
