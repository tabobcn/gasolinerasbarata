import type { Metadata } from "next";
import { AlertsList } from "@/components/screens/Alerts";

export const metadata: Metadata = { title: "Alertas de precio" };

export default function Page() {
  return <AlertsList />;
}
