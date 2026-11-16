import type { Metadata } from "next";
import { Charge } from "@/components/screens/Charge";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Cargadores para coche eléctrico cerca: precio y si funcionan",
  description:
    "Puntos de recarga cerca de ti con el precio por kWh, los enchufes compatibles con tu coche, si funcionan, si están libres ahora y cuánto cuesta llenar la batería. Datos de Red Eléctrica (REVE).",
  // /carga?lat=…&lon=… es la misma página: para Google solo cuenta esta dirección
  alternates: { canonical: `${SITE_URL}/carga` },
};

export default function Page() {
  return <Charge />;
}
