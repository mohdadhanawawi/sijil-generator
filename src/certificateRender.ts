// Browser-only helpers for drawing text fields onto a certificate template
// with <canvas>.

export type CertificateField = {
  id: string;
  label: string;
  // The one field bound to the names list - its text is supplied per
  // certificate at draw time. Every other field is static: the same text
  // on every certificate in a batch (e.g. certificate title, date).
  isDynamic: boolean;
  text: string;
  xPct: number;
  yPct: number;
  fontSizePct: number;
  fontFamily: string;
  fontWeight: string;
  fontColor: string;
};

export type CertificateTemplate = {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  fields: CertificateField[];
};

let cachedImage: { src: string; img: HTMLImageElement } | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  if (cachedImage?.src === src) return Promise.resolve(cachedImage.img);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cachedImage = { src, img };
      resolve(img);
    };
    img.onerror = () => reject(new Error("Gagal muatkan imej templat."));
    img.src = src;
  });
}

// Canvas only picks up a font once the browser has actually loaded it -
// without this, the first draw after switching fonts can silently fall
// back to a default font.
export async function ensureFontsLoaded(
  fields: Pick<CertificateField, "fontFamily" | "fontWeight">[],
  sizePx = 48
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const seen = new Set<string>();
  const loads: Promise<unknown>[] = [];
  for (const { fontFamily, fontWeight } of fields) {
    const key = `${fontWeight}|${fontFamily}`;
    if (seen.has(key)) continue;
    seen.add(key);
    loads.push(document.fonts.load(`${fontWeight} ${sizePx}px ${fontFamily}`).catch(() => {}));
  }
  try {
    await Promise.all(loads);
    await document.fonts.ready;
  } catch {
    // Best-effort - canvas falls back to a default font if this fails.
  }
}

export async function drawCertificate(
  canvas: HTMLCanvasElement,
  template: CertificateTemplate,
  dynamicValue: string
): Promise<void> {
  const img = await loadImage(template.imageDataUrl);
  canvas.width = template.imageWidth;
  canvas.height = template.imageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const field of template.fields) {
    const text = field.isDynamic ? dynamicValue : field.text;
    if (!text) continue;
    const fontSize = Math.max(1, Math.round(field.fontSizePct * template.imageWidth));
    ctx.font = `${field.fontWeight} ${fontSize}px ${field.fontFamily}`;
    ctx.fillStyle = field.fontColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, field.xPct * canvas.width, field.yPct * canvas.height);
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gagal jana imej sijil."));
    }, "image/png");
  });
}

export function slugifyName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "peserta";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
