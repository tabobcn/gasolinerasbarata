import type { Metadata } from "next";
import { RouteScreen } from "@/components/screens/RouteScreen";

export const metadata: Metadata = {
  title: "Gasolineras y cargadores en tu ruta",
  description: "Dinos a dónde vas y te enseñamos dónde repostar o cargar por el camino: lo más barato contando el desvío, con precios oficiales.",
};

export default function Page() {
  return <RouteScreen />;
}
