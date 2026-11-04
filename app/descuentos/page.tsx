import type { Metadata } from "next";
import { Discounts } from "@/components/screens/Discounts";

export const metadata: Metadata = { title: "Mis descuentos" };

export default function Page() {
  return <Discounts />;
}
