import type { Metadata } from "next";
import { Favorites } from "@/components/screens/Favorites";

export const metadata: Metadata = { title: "Favoritas" };

export default function Page() {
  return <Favorites />;
}
