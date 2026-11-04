import type { Metadata } from "next";
import { RouteScreen } from "@/components/screens/RouteScreen";

export const metadata: Metadata = { title: "Gasolineras en ruta" };

export default function Page() {
  return <RouteScreen />;
}
