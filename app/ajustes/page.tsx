import type { Metadata } from "next";
import { SettingsScreen } from "@/components/screens/SettingsScreen";

export const metadata: Metadata = { title: "Ajustes", robots: { index: false } };

export default function Page() {
  return <SettingsScreen />;
}
