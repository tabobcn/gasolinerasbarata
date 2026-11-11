import type { Metadata } from "next";
import { Refuels } from "@/components/screens/Refuels";

export const metadata: Metadata = {
  title: "Mis repostajes",
  description: "Apunta lo que repostas y mira cuánto gastas al mes, a qué precio medio y cuánto consume tu coche. Se guarda solo en tu móvil.",
};

export default function Page() {
  return <Refuels />;
}
