/** Cadrage d'une image dans une fenêtre 16/9 : zoom et centre exprimés dans l'image d'origine. */
export const CROP_RATIO = 16 / 9;
export const MAX_ZOOM = 3;
export const OUT_W = 1280;
export const OUT_H = 720;

export type Crop = { zoom: number; cx: number; cy: number };

/** Rectangle visible (en pixels de l'image d'origine) pour un cadrage donné. */
export function cropRect(w: number, h: number, c: Crop) {
  const bw = Math.min(w, h * CROP_RATIO);
  const bh = bw / CROP_RATIO;
  const vw = bw / c.zoom;
  const vh = bh / c.zoom;
  const x0 = Math.min(Math.max(c.cx - vw / 2, 0), w - vw);
  const y0 = Math.min(Math.max(c.cy - vh / 2, 0), h - vh);
  return { x0, y0, vw, vh };
}

export const centered = (w: number, h: number): Crop => ({ zoom: 1, cx: w / 2, cy: h / 2 });

/** Recentre le cadrage sur un rectangle déjà borné (évite que le centre sorte de l'image). */
export function normalize(w: number, h: number, c: Crop): Crop {
  const r = cropRect(w, h, c);
  return { zoom: c.zoom, cx: r.x0 + r.vw / 2, cy: r.y0 + r.vh / 2 };
}

/** Produit l'image recadrée (1280 × 720, JPEG). */
export async function renderCrop(img: HTMLImageElement, c: Crop, name: string): Promise<File> {
  const { x0, y0, vw, vh } = cropRect(img.naturalWidth, img.naturalHeight, c);
  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Le recadrage n'est pas disponible sur ce navigateur.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  ctx.drawImage(img, x0, y0, vw, vh, 0, 0, OUT_W, OUT_H);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) throw new Error("Le recadrage a échoué.");
  return new File([blob], `${name.replace(/\.[^.]+$/, "") || "image"}.jpg`, { type: "image/jpeg" });
}
