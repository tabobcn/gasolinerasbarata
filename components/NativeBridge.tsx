"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IN_APP_NOTICE, isNativeApp, listenNativePush, type InAppNotice } from "@/lib/native";
import { Icon } from "./Icon";

/**
 * Solo en la app de Android: al tocar un aviso se abre su página, y si llega uno con la app abierta
 * (Android no lo enseña en ese caso) se muestra arriba unos segundos.
 */
export function NativeBridge() {
  const router = useRouter();
  const [notice, setNotice] = useState<InAppNotice | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let off: (() => void) | null = null;
    let alive = true;
    void listenNativePush((url) => router.push(url))
      .then((f) => (alive ? (off = f) : f()))
      .catch(() => {});
    let t: ReturnType<typeof setTimeout> | null = null;
    const onNotice = (e: Event) => {
      setNotice((e as CustomEvent<InAppNotice>).detail);
      if (t) clearTimeout(t);
      t = setTimeout(() => setNotice(null), 8000);
    };
    window.addEventListener(IN_APP_NOTICE, onNotice);
    return () => {
      alive = false;
      off?.();
      if (t) clearTimeout(t);
      window.removeEventListener(IN_APP_NOTICE, onNotice);
    };
  }, [router]);

  if (!notice) return null;
  return (
    <div className="in-app-notice" role="status">
      <Icon name="bell" size={20} />
      <Link href={notice.url ?? "/alertas"} className="col-2 grow min0" onClick={() => setNotice(null)}>
        <span className="b14">{notice.title}</span>
        {notice.body && <span className="b13 muted">{notice.body}</span>}
      </Link>
      <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
        ×
      </button>
    </div>
  );
}
