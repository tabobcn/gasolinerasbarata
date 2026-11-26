import type { Metadata } from "next";
import { Suspense } from "react";
import { MyCar } from "@/components/screens/MyCar";

export const metadata: Metadata = { title: "Mis vehículos" };

export default function Page() {
  return (
    <Suspense>
      <MyCar />
    </Suspense>
  );
}
