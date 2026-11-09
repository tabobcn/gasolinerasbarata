import type { Metadata } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/ui";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <div className="screen with-nav">
      <div className="stack-16 pad-x top">
        <h1 className="h1 big">No encontramos esa página</h1>
        <p className="b15 muted">Puede que el enlace esté mal escrito o que esa gasolinera o cargador ya no exista.</p>
        <Link href="/" className="btn primary big">
          Ver gasolineras cerca
        </Link>
        <Link href="/carga" className="btn soft">
          Ver cargadores cerca
        </Link>
        <Link href="/gasolineras" className="btn soft">
          Precios por provincia
        </Link>
      </div>
      <BottomNav />
    </div>
  );
}
