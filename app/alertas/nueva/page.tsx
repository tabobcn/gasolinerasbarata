import type { Metadata } from "next";
import { NewAlert } from "@/components/screens/Alerts";

export const metadata: Metadata = { title: "Nueva alerta" };

export default function Page() {
  return <NewAlert />;
}
