// Browser-only helpers for drawing a name onto a certificate template with
// <canvas>.

export type CertificateTemplate = {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  nameXPct: number;
  nameYPct: number;
  fontSizePct: number;
  fontFamily: string;
  fontWeight: string;
  fontColor: string;
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
export async function ensureFontLoaded(
  fontFamily: string,
  fontWeight: string,
  sizePx = 48
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await document.fonts.load(`${fontWeight} ${sizePx}px ${fontFamily}`);
    await document.fonts.ready;
  } catch {
    // Best-effort - canvas falls back to a default font if this fails.
  }
}

export async function drawCertificate(
  canvas: HTMLCanvasElement,
  template: CertificateTemplate,
  name: string
): Promise<void> {
  const img = await loadImage(template.imageDataUrl);
  canvas.width = template.imageWidth;
  canvas.height = template.imageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const fontSize = Math.max(1, Math.round(template.fontSizePct * template.imageWidth));
  ctx.font = `${template.fontWeight} ${fontSize}px ${template.fontFamily}`;
  ctx.fillStyle = template.fontColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, template.nameXPct * canvas.width, template.nameYPct * canvas.height);
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
