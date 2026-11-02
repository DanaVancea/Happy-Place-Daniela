import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_ZOOM, centered, cropRect, normalize, renderCrop, type Crop } from "@/lib/image-crop";

/**
 * Aperçu et recadrage d'une image (fenêtre 16/9, telle qu'elle s'affiche dans l'actualité).
 * On déplace l'image en la faisant glisser (ou avec les flèches) et on zoome avec le curseur.
 * `onChange` reçoit l'image recadrée, prête à être envoyée.
 */
export function ImageCropper({
  file,
  onChange,
  disabled,
}: {
  file: File;
  onChange: (cropped: File) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Chargement de l'image d'origine
  useEffect(() => {
    const u = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      img.current = el;
      setCrop(centered(el.naturalWidth, el.naturalHeight));
      setUrl(u);
    };
    el.onerror = () => toast.error("Cette image n'a pas pu être lue.");
    el.src = u;
    return () => {
      URL.revokeObjectURL(u);
      img.current = null;
      setUrl(null);
      setCrop(null);
    };
  }, [file]);

  // Image recadrée mise à jour après chaque réglage (légère attente pendant le glissement)
  useEffect(() => {
    if (!crop || !img.current) return;
    const el = img.current;
    const t = setTimeout(() => {
      renderCrop(el, crop, file.name)
        .then(onChange)
        .catch((e: Error) => toast.error(e.message));
    }, 150);
    return () => clearTimeout(t);
    // onChange change à chaque rendu du parent : on ne relance que sur le cadrage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, file]);

  const move = useCallback((dx: number, dy: number) => {
    setCrop((c) => {
      const el = img.current;
      if (!c || !el) return c;
      return normalize(el.naturalWidth, el.naturalHeight, { ...c, cx: c.cx + dx, cy: c.cy + dy });
    });
  }, []);

  if (!url || !crop || !img.current) {
    return <div className="aspect-video w-full max-w-[28rem] bg-surface-container animate-pulse" />;
  }
  const w = img.current.naturalWidth;
  const h = img.current.naturalHeight;
  const r = cropRect(w, h, crop);
  const frameW = frame.current?.getBoundingClientRect().width ?? 1;
  const pxPerSrc = frameW / r.vw;

  return (
    <div className="w-full max-w-[28rem] space-y-xs">
      <p className="font-label-sm text-label-sm text-on-surface-variant">
        APERÇU : voici l'image telle qu'elle sera affichée
      </p>
      <div
        ref={frame}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label="Cadrage de l'image : glisse pour déplacer, flèches du clavier possibles"
        className={`relative aspect-video w-full overflow-hidden border border-outline-variant bg-surface-container touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          disabled ? "" : dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, crop };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setCrop(
            normalize(w, h, {
              ...d.crop,
              cx: d.crop.cx - (e.clientX - d.x) / pxPerSrc,
              cy: d.crop.cy - (e.clientY - d.y) / pxPerSrc,
            }),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          const step = r.vw * 0.05;
          const k: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          if (k[e.key]) {
            e.preventDefault();
            move(...k[e.key]);
          }
        }}
      >
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute max-w-none pointer-events-none"
          style={{
            width: `${(w / r.vw) * 100}%`,
            left: `${(-r.x0 / r.vw) * 100}%`,
            top: `${(-r.y0 / r.vh) * 100}%`,
          }}
        />
      </div>
      <label className="flex items-center gap-xs font-label-sm text-label-sm text-on-surface-variant">
        Zoom
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={crop.zoom}
          disabled={disabled}
          aria-label="Zoom"
          onChange={(e) => setCrop(normalize(w, h, { ...crop, zoom: Number(e.target.value) }))}
          className="flex-1"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCrop(centered(w, h))}
          className="text-primary underline disabled:opacity-50"
        >
          Réinitialiser
        </button>
      </label>
    </div>
  );
}
