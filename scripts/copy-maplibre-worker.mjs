// MapLibre 6 carga su "worker" como archivo aparte: lo copiamos a /public para que Next lo sirva.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
const dir = new URL("../public/maplibre/", import.meta.url);
if (existsSync(src)) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, new URL("maplibre-gl-worker.mjs", dir));
  console.log("maplibre worker copiado a public/maplibre/");
}
