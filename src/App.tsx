import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canvasToPngBlob,
  downloadBlob,
  drawCertificate,
  ensureFontLoaded,
  slugifyName,
  type CertificateTemplate,
} from "./certificateRender";
import { FONT_OPTIONS, fontWeightFor } from "./fonts";
import { parseNamesFile, parseNamesText } from "./parseNames";

const STORAGE_KEY = "sijil-generator:template:v1";

type StoredTemplate = {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  nameXPct: number;
  nameYPct: number;
  fontSizePct: number;
  fontFamily: string;
  fontColor: string;
};

function loadStoredTemplate(): StoredTemplate | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTemplate;
  } catch {
    return null;
  }
}

export default function App() {
  const stored = useMemo(loadStoredTemplate, []);

  const [image, setImage] = useState<{ dataUrl: string; width: number; height: number } | null>(
    stored ? { dataUrl: stored.imageDataUrl, width: stored.imageWidth, height: stored.imageHeight } : null
  );
  const [fontFamily, setFontFamily] = useState(stored?.fontFamily ?? FONT_OPTIONS[0].family);
  const [fontSizePct, setFontSizePct] = useState(stored?.fontSizePct ?? 0.06);
  const [fontColor, setFontColor] = useState(stored?.fontColor ?? "#1a1a1a");
  const [nameXPct, setNameXPct] = useState(stored?.nameXPct ?? 0.5);
  const [nameYPct, setNameYPct] = useState(stored?.nameYPct ?? 0.55);
  const [previewName, setPreviewName] = useState("Nama Contoh Peserta");

  const [namesText, setNamesText] = useState("");
  const [autosaveNote, setAutosaveNote] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config: CertificateTemplate | null = useMemo(
    () =>
      image
        ? {
            imageDataUrl: image.dataUrl,
            imageWidth: image.width,
            imageHeight: image.height,
            nameXPct,
            nameYPct,
            fontSizePct,
            fontFamily,
            fontWeight: fontWeightFor(fontFamily),
            fontColor,
          }
        : null,
    [image, nameXPct, nameYPct, fontSizePct, fontFamily, fontColor]
  );

  // Autosave the template (everything except the names being generated) so
  // it survives a page refresh - this is a personal tool, one browser.
  useEffect(() => {
    if (!config) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          imageDataUrl: config.imageDataUrl,
          imageWidth: config.imageWidth,
          imageHeight: config.imageHeight,
          nameXPct: config.nameXPct,
          nameYPct: config.nameYPct,
          fontSizePct: config.fontSizePct,
          fontFamily: config.fontFamily,
          fontColor: config.fontColor,
        })
      );
      setAutosaveNote(null);
    } catch {
      setAutosaveNote("Templat terlalu besar untuk auto-simpan dalam pelayar - kekal berfungsi, tapi akan hilang bila refresh.");
    }
  }, [config]);

  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      await ensureFontLoaded(config.fontFamily, config.fontWeight);
      if (cancelled || !canvasRef.current) return;
      await drawCertificate(canvasRef.current, config, previewName.trim() || "Nama Contoh");
    })();
    return () => {
      cancelled = true;
    };
  }, [config, previewName]);

  const handleTemplateFile = useCallback((file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Sila muat naik fail imej (JPG/PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => setImage({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => setError("Gagal baca imej templat.");
      img.src = dataUrl;
    };
    reader.onerror = () => setError("Gagal muat naik fail.");
    reader.readAsDataURL(file);
  }, []);

  const handleNamesFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseNamesFile(String(reader.result ?? ""));
      if (parsed.length === 0) {
        setError("Tiada nama dijumpai dalam fail itu.");
        return;
      }
      setNamesText((prev) => (prev.trim() ? `${prev.trim()}\n${parsed.join("\n")}` : parsed.join("\n")));
    };
    reader.onerror = () => setError("Gagal baca fail nama.");
    reader.readAsText(file);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setNameXPct(Math.min(1, Math.max(0, x)));
    setNameYPct(Math.min(1, Math.max(0, y)));
  };

  const handleClearTemplate = () => {
    setImage(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const finalNames = useMemo(() => parseNamesText(namesText), [namesText]);

  const removeNameAt = (index: number) => {
    setNamesText(finalNames.filter((_, i) => i !== index).join("\n"));
  };

  const generateOnePng = useCallback(
    async (name: string): Promise<Blob> => {
      if (!config) throw new Error("Tiada templat");
      const off = document.createElement("canvas");
      await drawCertificate(off, config, name);
      return canvasToPngBlob(off);
    },
    [config]
  );

  const handleDownloadOne = async (name: string) => {
    if (!config) return;
    setError(null);
    try {
      await ensureFontLoaded(config.fontFamily, config.fontWeight);
      const blob = await generateOnePng(name);
      downloadBlob(blob, `sijil-${slugifyName(name)}.png`);
    } catch {
      setError("Gagal jana sijil untuk nama ini.");
    }
  };

  const handleGenerateAll = async () => {
    if (!config || finalNames.length === 0) return;
    setError(null);
    setIsGenerating(true);
    setProgress({ done: 0, total: finalNames.length });
    try {
      await ensureFontLoaded(config.fontFamily, config.fontWeight);
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      for (let i = 0; i < finalNames.length; i++) {
        const name = finalNames[i];
        const blob = await generateOnePng(name);
        const base = slugifyName(name);
        const count = usedNames.get(base) ?? 0;
        usedNames.set(base, count + 1);
        zip.file(count === 0 ? `${base}.png` : `${base}-${count + 1}.png`, blob);
        setProgress({ done: i + 1, total: finalNames.length });
        if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "sijil.zip");
    } catch {
      setError("Gagal jana sijil bulk. Cuba lagi.");
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Sijil Generator</h1>
        <p>
          Muat naik templat sijil, letak nama pada kedudukan yang betul, masukkan senarai nama
          (taip atau muat naik fail), lalu jana sijil untuk semua orang sekali gus.
        </p>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="field">
            <label htmlFor="templateFile">Templat Sijil (imej)</label>
            <p className="hint">
              Muat naik sampel sijil (JPG/PNG). Klik pada sijil di bawah untuk letak kedudukan
              nama.
            </p>
            <input
              id="templateFile"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleTemplateFile(file);
              }}
            />
          </div>

          {config ? (
            <>
              <div className="canvas-frame">
                <canvas ref={canvasRef} onClick={handleCanvasClick} className="canvas" />
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Fon</label>
                  <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.family} value={f.family}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Warna Teks</label>
                  <input
                    type="color"
                    className="color-input"
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                  />
                </div>
                <div className="field span-2">
                  <label>Saiz Teks ({Math.round(fontSizePct * 100)}% lebar sijil)</label>
                  <input
                    type="range"
                    min={0.02}
                    max={0.15}
                    step={0.005}
                    value={fontSizePct}
                    onChange={(e) => setFontSizePct(Number(e.target.value))}
                  />
                </div>
                <div className="field span-2">
                  <label>Pratonton Nama</label>
                  <input
                    type="text"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    placeholder="Taip nama untuk lihat pratonton"
                  />
                </div>
              </div>

              <div className="actions-row">
                <button type="button" className="btn btn-ghost" onClick={handleClearTemplate}>
                  Padam Templat
                </button>
                {autosaveNote && <p className="note">{autosaveNote}</p>}
              </div>
            </>
          ) : (
            <p className="empty-hint">Muat naik imej sijil untuk mula.</p>
          )}

          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel">
          <div className="field">
            <label htmlFor="namesText">Senarai Nama</label>
            <p className="hint">Satu nama satu baris. Boleh taip terus atau muat naik fail.</p>
            <textarea
              id="namesText"
              rows={8}
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder={"Contoh:\nAhmad bin Ali\nSiti binti Kassim"}
            />
            <div className="actions-row">
              <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                Muat Naik Fail (CSV/TXT)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="visually-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleNamesFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {finalNames.length > 0 && (
            <div className="names-list">
              {finalNames.map((name, i) => (
                <div key={`${name}-${i}`} className="names-list-row">
                  <span className="names-list-name">{name}</span>
                  <div className="names-list-actions">
                    <button type="button" className="link-btn" disabled={!config} onClick={() => handleDownloadOne(name)}>
                      Muat Turun
                    </button>
                    <button type="button" className="link-btn link-btn-danger" onClick={() => removeNameAt(i)}>
                      Buang
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="generate-bar">
            <p>
              Jumlah sijil akan dijana: <strong>{finalNames.length}</strong>
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!config || finalNames.length === 0 || isGenerating}
              onClick={handleGenerateAll}
            >
              {isGenerating
                ? `Menjana ${progress?.done ?? 0} / ${progress?.total ?? 0}...`
                : "Jana & Muat Turun Semua (ZIP)"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
