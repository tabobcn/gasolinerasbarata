import { ImageResponse } from "next/og";
import { iconSvg } from "@/lib/icon";
import { APP_NAME, SITE_URL } from "@/lib/config";

/** Imagen que se ve al compartir cualquier enlace de la web (WhatsApp, Telegram, redes…) */
export const alt = "La gasolinera y el cargador eléctrico más baratos cerca de ti";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const icon = `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg(false, 300))}`;
  const chip = (text: string, bg: string) => (
    <div style={{ display: "flex", background: bg, color: "#ffffff", fontSize: 30, padding: "12px 26px", borderRadius: 999 }}>{text}</div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#F4F6F8", padding: "0 80px", gap: 64 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} width={300} height={300} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 26, flex: 1 }}>
          <div style={{ display: "flex", fontSize: 34, color: "#5B6675" }}>{APP_NAME}</div>
          <div style={{ display: "flex", fontSize: 66, lineHeight: 1.12, color: "#0E1726", letterSpacing: -1.5 }}>
            La gasolinera y el cargador más baratos cerca de ti
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {chip("Gasolina y diésel", "#0B7A43")}
            {chip("Cargadores eléctricos", "#1F4FD1")}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#5B6675" }}>Precios oficiales · Ahorro real · {SITE_URL.replace(/^https?:\/\//, "")}</div>
        </div>
      </div>
    ),
    size,
  );
}
