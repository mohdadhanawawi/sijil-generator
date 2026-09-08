import JSZip from "jszip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canvasToPngBlob,
  downloadBlob,
  drawCertificate,
  ensureFontsLoaded,
  slugifyName,
  type CertificateField,
  type CertificateTemplate,
} from "./certificateRender";
import { FONT_OPTIONS, fontWeightFor } from "./fonts";
import { parseNamesFile, parseNamesText } from "./parseNames";

const STORAGE_KEY = "sijil-generator:template:v2";
const NAME_FIELD_ID = "name";

type StoredField = Omit<CertificateField, "fontWeight">;

type StoredTemplate = {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  fields: StoredField[];
};

function defaultNameField(): StoredField {
  return {
    id: NAME_FIELD_ID,
    label: "Nama",
    isDynamic: true,
    text: "",
    xPct: 0.5,
    yPct: 0.55,
    fontSizePct: 0.06,
    fontFamily: FONT_OPTIONS[0].family,
    fontColor: "#1a1a1a",
  };
}

function loadStoredTemplate(): StoredTemplate | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTemplate;
    if (!parsed.fields?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

let newFieldCounter = 0;
function makeFieldId(): string {
  newFieldCounter += 1;
  return `field-${Date.now()}-${newFieldCounter}`;
}

export default function App() {
  const stored = useMemo(loadStoredTemplate, []);

  const [image, setImage] = useState<{ dataUrl: string; width: number; height: number } | null>(
    stored ? { dataUrl: stored.imageDataUrl, width: stored.imageWidth, height: stored.imageHeight } : null
  );
  const [fields, setFields] = useState<StoredField[]>(stored?.fields ?? [defaultNameField()]);
  const [activeFieldId, setActiveFieldId] = useState<string>(fields[0]?.id ?? NAME_FIELD_ID);
  const [previewName, setPreviewName] = useState("Nama Contoh Peserta");

  const [namesText, setNamesText] = useState("");
  const [autosaveNote, setAutosaveNote] = useState<string | null>(null);
  const [isProcessingTemplate, setIsProcessingTemplate] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeField = fields.find((f) => f.id === activeFieldId) ?? fields[0];

  const config: CertificateTemplate | null = useMemo(
    () =>
      image
        ? {
            imageDataUrl: image.dataUrl,
            imageWidth: image.width,
            imageHeight: image.height,
            fields: fields.map((f) => ({ ...f, fontWeight: fontWeightFor(f.fontFamily) })),
          }
        : null,
    [image, fields]
  );

  // Autosave the template (everything except the names being generated) so
  // it survives a page refresh - this is a personal tool, one browser.
  useEffect(() => {
    if (!image) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          imageDataUrl: image.dataUrl,
          imageWidth: image.width,
          imageHeight: image.height,
          fields,
        })
      );
      setAutosaveNote(null);
    } catch {
      setAutosaveNote("Templat terlalu besar untuk auto-simpan dalam pelayar - kekal berfungsi, tapi akan hilang bila refresh.");
    }
  }, [image, fields]);

  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      await ensureFontsLoaded(config.fields);
      if (cancelled || !canvasRef.current) return;
      await drawCertificate(canvasRef.current, config, previewName.trim() || "Nama Contoh");
    })();
    return () => {
      cancelled = true;
    };
  }, [config, previewName]);

  const handleTemplateFile = useCallback((file: File) => {
    setError(null);

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      setIsProcessingTemplate(true);
      // Dynamically imported so the ~700KB pdf.js library is only
      // downloaded by people who actually upload a PDF template.
      import("./pdfTemplate")
        .then(({ renderPdfFirstPage }) => renderPdfFirstPage(file))
        .then(({ dataUrl, width, height }) => setImage({ dataUrl, width, height }))
        .catch(() => setError("Gagal proses PDF. Pastikan fail PDF sah dan tidak rosak."))
        .finally(() => setIsProcessingTemplate(false));
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Sila muat naik fail imej (JPG/PNG) atau PDF.");
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

  const updateActiveField = (patch: Partial<StoredField>) => {
    setFields((prev) => prev.map((f) => (f.id === activeFieldId ? { ...f, ...patch } : f)));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    updateActiveField({ xPct: Math.min(1, Math.max(0, x)), yPct: Math.min(1, Math.max(0, y)) });
  };

  const handleAddField = () => {
    const id = makeFieldId();
    const newField: StoredField = {
      id,
      label: "Teks Baharu",
      isDynamic: false,
      text: "Teks Baharu",
      xPct: 0.5,
      yPct: 0.3,
      fontSizePct: 0.04,
      fontFamily: FONT_OPTIONS[0].family,
      fontColor: "#1a1a1a",
    };
    setFields((prev) => [...prev, newField]);
    setActiveFieldId(id);
  };

  const handleRemoveField = (id: string) => {
    if (id === NAME_FIELD_ID) return;
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (activeFieldId === id) setActiveFieldId(NAME_FIELD_ID);
  };

  const handleClearTemplate = () => {
    setImage(null);
    setFields([defaultNameField()]);
    setActiveFieldId(NAME_FIELD_ID);
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
      await ensureFontsLoaded(config.fields);
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
      await ensureFontsLoaded(config.fields);
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
          Muat naik templat sijil, letak nama (dan teks lain seperti tajuk sijil/tarikh) pada
          kedudukan yang betul, masukkan senarai nama, lalu jana sijil untuk semua orang sekali
          gus.
        </p>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="field">
            <label htmlFor="templateFile">Templat Sijil (imej atau PDF)</label>
            <p className="hint">
              Muat naik sampel sijil (JPG/PNG/PDF). Untuk PDF, muka surat pertama sahaja yang
              digunakan.
            </p>
            <input
              id="templateFile"
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleTemplateFile(file);
              }}
            />
          </div>

          {isProcessingTemplate && <p className="hint">Memproses PDF...</p>}

          {config && activeField ? (
            <>
              <div className="canvas-frame">
                <canvas ref={canvasRef} onClick={handleCanvasClick} className="canvas" />
              </div>

              <div className="field">
                <label>Teks pada Sijil</label>
                <p className="hint">
                  Pilih teks di bawah, klik pada sijil di atas untuk letak kedudukannya.
                </p>
                <div className="field-tabs">
                  {fields.map((f) => (
                    <span key={f.id} className="field-tab-wrap">
                      <button
                        type="button"
                        className={`field-tab${f.id === activeFieldId ? " active" : ""}`}
                        onClick={() => setActiveFieldId(f.id)}
                      >
                        {f.label || "(tiada label)"}
                        {f.isDynamic && " (senarai)"}
                      </button>
                      {!f.isDynamic && (
                        <button
                          type="button"
                          className="field-tab-remove"
                          title="Buang teks ini"
                          onClick={() => handleRemoveField(f.id)}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAddField}>
                    + Tambah Teks
                  </button>
                </div>
              </div>

              <div className="grid-2">
                {activeField.isDynamic ? (
                  <div className="field span-2">
                    <label>Pratonton Nama</label>
                    <input
                      type="text"
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                      placeholder="Taip nama untuk lihat pratonton"
                    />
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label>Label (untuk rujukan sahaja)</label>
                      <input
                        type="text"
                        value={activeField.label}
                        onChange={(e) => updateActiveField({ label: e.target.value })}
                        placeholder="cth. Tajuk Sijil, Tarikh"
                      />
                    </div>
                    <div className="field">
                      <label>Teks</label>
                      <input
                        type="text"
                        value={activeField.text}
                        onChange={(e) => updateActiveField({ text: e.target.value })}
                        placeholder="cth. Sijil Penyertaan, 28 Ogos 2026"
                      />
                    </div>
                  </>
                )}

                <div className="field">
                  <label>Fon</label>
                  <select
                    value={activeField.fontFamily}
                    onChange={(e) => updateActiveField({ fontFamily: e.target.value })}
                  >
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
                    value={activeField.fontColor}
                    onChange={(e) => updateActiveField({ fontColor: e.target.value })}
                  />
                </div>
                <div className="field span-2">
                  <label>Saiz Teks ({Math.round(activeField.fontSizePct * 100)}% lebar sijil)</label>
                  <input
                    type="range"
                    min={0.02}
                    max={0.15}
                    step={0.005}
                    value={activeField.fontSizePct}
                    onChange={(e) => updateActiveField({ fontSizePct: Number(e.target.value) })}
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
            <p className="empty-hint">Muat naik imej atau PDF sijil untuk mula.</p>
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
