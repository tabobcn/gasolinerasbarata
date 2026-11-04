import type { Metadata } from "next";
import { Charge } from "@/components/screens/Charge";

export const metadata: Metadata = { title: "Modo carga" };

export default function Page() {
  return <Charge />;
}
