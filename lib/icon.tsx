/**
 * Icono de la app: mitad gasolina (verde, surtidor) y mitad eléctrico (azul, cargador).
 * Se usa como favicon (app/icon.svg) y para los PNG de la app instalada (ImageResponse).
 */
const GLYPHS = `
<rect x="6" y="17" width="15" height="26" rx="3" fill="#fff"/>
<rect x="9" y="20.5" width="9" height="6.5" rx="1.3" fill="#0B7A43"/>
<rect x="4" y="41" width="19" height="4.5" rx="2.25" fill="#fff"/>
<path d="M21 28 h1.6 a2 2 0 0 1 2 2 v6.5 a2 2 0 0 0 4 0 v-11.5 l-3 -3.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="37" y="15" width="15" height="28" rx="3.5" fill="#fff"/>
<rect x="40" y="18.5" width="9" height="6" rx="1.3" fill="#1F4FD1"/>
<path d="M46.3 27.5 L41.2 35.6 h3.4 l-1.3 6 l5.4 -8.7 h-3.4 z" fill="#1F4FD1"/>
<rect x="35" y="41" width="19" height="4.5" rx="2.25" fill="#fff"/>
<path d="M52 21.5 h1.8 a2.4 2.4 0 0 1 2.4 2.4 v8.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
<rect x="53.2" y="32" width="6" height="6.5" rx="1.6" fill="#fff"/>
<rect x="54.3" y="38" width="1.4" height="3.2" rx=".7" fill="#fff"/>
<rect x="56.7" y="38" width="1.4" height="3.2" rx=".7" fill="#fff"/>`;

const HALVES = `<path d="M0 0 H37 L27 64 H0 Z" fill="#0B7A43"/><path d="M37 0 H64 V64 H27 Z" fill="#1F4FD1"/>`;

/** fullBleed: fondo hasta el borde y dibujo más pequeño (iOS y Android recortan el icono a su manera) */
export function iconSvg(fullBleed = false, size?: number): string {
  const dims = size ? ` width="${size}" height="${size}"` : "";
  const bg = fullBleed
    ? HALVES
    : `<defs><clipPath id="r"><rect width="64" height="64" rx="15"/></clipPath></defs><g clip-path="url(#r)">${HALVES}</g>`;
  const glyphs = fullBleed ? `<g transform="translate(32 32) scale(0.8) translate(-30 -31)">${GLYPHS}</g>` : GLYPHS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${dims}>${bg}${glyphs}</svg>`;
}

export function iconJsx(size: number, fullBleed: boolean) {
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg(fullBleed, size))}`;
  return (
    <div style={{ width: size, height: size, display: "flex" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={size} height={size} alt="" />
    </div>
  );
}
