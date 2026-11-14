/**
 * Datos estructurados (schema.org) para buscadores. Solo describen lo que ya se ve en la página.
 * El "<" se escapa para que ningún nombre pueda cerrar la etiqueta <script>.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
