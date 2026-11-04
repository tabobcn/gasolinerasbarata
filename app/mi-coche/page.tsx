import type { Metadata } from "next";
import { MyCar } from "@/components/screens/MyCar";

export const metadata: Metadata = { title: "Mi coche" };

export default function Page() {
  return <MyCar />;
}
