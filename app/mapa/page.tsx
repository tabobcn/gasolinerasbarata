import type { Metadata } from "next";
import { MapScreen } from "@/components/screens/MapScreen";

export const metadata: Metadata = { title: "Mapa de gasolineras" };

export default function Page() {
  return <MapScreen />;
}
