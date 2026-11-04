import { ImageResponse } from "next/og";
import { iconJsx } from "@/lib/icon";

/** /pwa-icon/192, /pwa-icon/512 y /pwa-icon/512m (maskable) */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const s = size.startsWith("512") ? 512 : 192;
  return new ImageResponse(iconJsx(s, size.endsWith("m")), {
    width: s,
    height: s,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
