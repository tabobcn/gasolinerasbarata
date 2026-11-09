import type { Metadata } from "next";
import { MapScreen } from "@/components/screens/MapScreen";

export const metadata: Metadata = {
  title: "Mapa de gasolineras y cargadores con precios",
  description: "Mapa con el precio de cada gasolinera y de cada punto de recarga para coche eléctrico a tu alrededor. Elige combustible o tu enchufe y ve la más barata.",
};

export default function Page() {
  return <MapScreen />;
}
