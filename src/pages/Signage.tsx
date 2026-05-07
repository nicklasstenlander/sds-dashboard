import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaType = "image" | "video";

interface PlaylistItem {
  key: string;
  name: string;
  type: MediaType;
  url: string;
  size: number;
  uploaded: string;
  duration: number; // sekunder (bilder)
}

// ─── Config ───────────────────────────────────────────────────────────────────
// .env:
//   VITE_WORKER_URL=https://sodss-signage.ditt-konto.workers.dev
//   VITE_WORKER_SECRET=din-hemliga-nyckel
//   VITE_PLAYER_URL=https://din-url.se/player.html

const WORKER_URL    = import.meta.env.VITE_WORKER_URL    ?? "";
const WORKER_SECRET = import.meta.env.VITE_WORKER_SECRET ?? "";
const PLAYER_URL    = import.meta.env.VITE_PLAYER_URL    ?? "/player.html";

const authHeader = { Authorization: `Bearer ${WORKER_SECRET}` };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleDateString("sv-SE") : "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ type }: { type: MediaType }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase" as const, padding: "2px 7px", borderRadius: 4,
      background: type === "image" ? "#CDDCD1" : "#dd5c86",
      color: type === "image" ? "#1e4025" : "#fff",
    }}>
      {type === "image" ? "Bild" : "Video"}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        padding: "5px 12px", borderRadius: 7, border: "1.5px solid #a3c0b2",
        background: copied ? "#1e4025" : "#f5f8f6", color: copied ? "#fff" : "#1e4025",
        fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
        transition: "all 0.2s", whiteSpace: "nowrap" as const,
      }}>
      {copied ? "✓ Kopierad" : "Kopiera URL"}
    </button>
  );
}

interface UploadJob {
  file: File;
  progress: number; // 0–100
  status: "waiting" | "uploading" | "done" | "error";
  errorMsg?: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Signage() {
  const [items, setItems]         = useState<PlaylistItem[]>([]);
  const [loading, setLoading]     = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const [jobs, setJobs]           = useState<UploadJob[]>([]);
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const fileInputRef              = useRef<HTMLInputElement>(null);

  // ── Fetch file list ──────────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (!WORKER_URL) return;
    setLoading(true);
    try {
      const res  = await fetch(`${WORKER_URL}/api/files`);
      const data = await res.json() as { files: any[] };
      setItems(data.files.map(f => ({ ...f, duration: 8 })));
    } catch (e) {
      console.error("Kunde inte hämta filer:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ── Upload ───────────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files: FileList) => {
    const newJobs: UploadJob[] = Array.from(files).map(f => ({
      file: f, progress: 0, status: "waiting",
    }));
    setJobs(prev => [...prev, ...newJobs]);

    for (let i = 0; i < newJobs.length; i++) {
      const job = newJobs[i];

      setJobs(prev => prev.map(j =>
        j.file === job.file ? { ...j, status: "uploading" } : j
      ));

      try {
        const formData = new FormData();
        formData.append("file", job.file);

        // XHR for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${WORKER_URL}/api/upload`);
          xhr.setRequestHeader("Authorization", `Bearer ${WORKER_SECRET}`);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setJobs(prev => prev.map(j =>
                j.file === job.file ? { ...j, progress: pct } : j
              ));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setJobs(prev => prev.map(j =>
                j.file === job.file ? { ...j, status: "done", progress: 100 } : j
              ));
              resolve();
            } else {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Nätverksfel"));
          xhr.send(formData);
        });

      } catch (e: any) {
        setJobs(prev => prev.map(j =>
          j.file === job.file ? { ...j, status: "error", errorMsg: e.message } : j
        ));
      }
    }

    // Refresh list after all uploads
    await fetchFiles();

    // Clear done jobs after 3s
    setTimeout(() => {
      setJobs(prev => prev.filter(j => j.status !== "done"));
    }, 3000);
  }, [fetchFiles]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (key: string) => {
    if (!confirm(`Ta bort "${key}"?`)) return;
    setDeleting(key);
    try {
      await fetch(`${WORKER_URL}/api/files/${encodeURIComponent(key)}`, {
        method: "DELETE", headers: authHeader,
      });
      setItems(prev => prev.filter(i => i.key !== key));
    } catch (e) {
      alert("Kunde inte ta bort filen.");
    } finally {
      setDeleting(null);
    }
  }, []);

  // ── Drag reorder ─────────────────────────────────────────────────────────
  const handleDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      setItems(prev => {
        const arr = [...prev];
        const from = arr.findIndex(i => i.key === dragId);
        const to   = arr.findIndex(i => i.key === dragOverId);
        const [el] = arr.splice(from, 1);
        arr.splice(to, 0, el);
        return arr;
      });
    }
    setDragId(null); setDragOverId(null);
  };

  // ── Player URL ───────────────────────────────────────────────────────────
  const screenUrl = (screenId: string) =>
    `${PLAYER_URL}?worker=${encodeURIComponent(WORKER_URL)}&screen=${screenId}`;

  const totalDuration = items.reduce((acc, i) =>
    acc + (i.type === "image" ? i.duration : 30), 0);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'DM Mono', monospace", color: "#111",
      padding: "32px 36px", maxWidth: 980, margin: "0 auto",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, gap: 16, flexWrap: "wrap" as const }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1e4025", margin: 0, letterSpacing: "-0.02em" }}>
            Skyltning
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a3c0b2" }}>
            {items.length} objekt · ca {Math.round(totalDuration / 60)} min per loop
          </p>
        </div>
        <button onClick={fetchFiles} disabled={loading} style={{
          padding: "9px 18px", borderRadius: 9, border: "none",
          background: "#CDDCD1", color: "#1e4025", fontFamily: "inherit",
          fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
        }}>
          {loading ? "⏳ Laddar…" : "↻ Uppdatera"}
        </button>
      </div>

      {/* ── Config warning ── */}
      {!WORKER_URL && (
        <div style={{
          background: "#fff8e1", border: "1.5px solid #f5c842", borderRadius: 10,
          padding: "14px 18px", marginBottom: 24, fontSize: 13, color: "#7a5c00",
        }}>
          ⚠️ <strong>VITE_WORKER_URL</strong> saknas i <code>.env</code>. Sätt upp Cloudflare Worker först.
        </div>
      )}

      {/* ── Screens ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#a3c0b2", margin: "0 0 12px" }}>
          Skärmar
        </h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
          {[
            { id: "reception", name: "Receptionen" },
            { id: "studio-a",  name: "Studio A" },
          ].map(s => (
            <div key={s.id} style={{
              background: "#fff", border: "1.5px solid #CDDCD1", borderRadius: 10,
              padding: "14px 18px", flex: 1, minWidth: 260,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: "#1e4025", fontSize: 14 }}>📺 {s.name}</span>
                <span style={{ fontSize: 10, background: "#f0faf4", color: "#1e4025", border: "1px solid #CDDCD1", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>
                  LIVE
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#a3c0b2", marginBottom: 10, fontFamily: "monospace", wordBreak: "break-all" as const }}>
                {screenUrl(s.id)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <CopyButton text={screenUrl(s.id)} />
                <a href={screenUrl(s.id)} target="_blank" rel="noreferrer"
                  style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid #CDDCD1", background: "transparent", color: "#1e4025", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                  Förhandsgranska ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Upload jobs ── */}
      {jobs.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {jobs.map((job, i) => (
              <div key={i} style={{
                background: "#fff", border: "1.5px solid #CDDCD1", borderRadius: 8,
                padding: "10px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1e4025" }}>{job.file.name}</span>
                  <span style={{ fontSize: 11, color: job.status === "error" ? "#dd5c86" : job.status === "done" ? "#1e4025" : "#a3c0b2" }}>
                    {job.status === "done" ? "✓ Klar" : job.status === "error" ? `✗ ${job.errorMsg}` : `${job.progress}%`}
                  </span>
                </div>
                <div style={{ height: 4, background: "#CDDCD1", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, transition: "width 0.3s",
                    width: `${job.progress}%`,
                    background: job.status === "error" ? "#dd5c86" : "#1e4025",
                  }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Drop zone ── */}
      <section style={{ marginBottom: 28 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#1e4025" : "#a3c0b2"}`,
            borderRadius: 12, padding: "32px 24px", textAlign: "center" as const,
            cursor: "pointer", background: dragOver ? "#f0faf4" : "#fafcfb",
            transition: "all 0.2s",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>⬆</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1e4025" }}>
            Dra och släpp bilder eller filmer här
          </div>
          <div style={{ fontSize: 12, color: "#a3c0b2", marginTop: 4 }}>
            JPG, PNG, WebP, MP4, MOV, WebM · Laddas upp direkt till Cloudflare R2
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); }} />
        </div>
      </section>

      {/* ── Playlist ── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#a3c0b2", margin: 0 }}>
            Spellista
          </h2>
          <span style={{ fontSize: 11, color: "#a3c0b2" }}>Dra för att ändra ordning</span>
        </div>

        {loading && items.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "40px", color: "#a3c0b2", fontSize: 13 }}>Laddar…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center" as const, padding: "40px", color: "#a3c0b2", fontSize: 13 }}>
            Inga filer än. Ladda upp något ovan!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {items.map((item, idx) => (
              <div key={item.key}
                draggable
                onDragStart={() => setDragId(item.key)}
                onDragEnter={() => setDragOverId(item.key)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: dragOverId === item.key ? "#f0faf4" : "#fff",
                  border: `1.5px solid ${dragOverId === item.key ? "#1e4025" : "#CDDCD1"}`,
                  borderRadius: 10, padding: "10px 14px", cursor: "grab",
                  transition: "border-color 0.15s, background 0.15s",
                  opacity: dragId === item.key ? 0.4 : 1,
                }}
              >
                {/* Nr */}
                <span style={{ width: 22, fontSize: 12, color: "#a3c0b2", fontWeight: 700, textAlign: "right" as const, flexShrink: 0 }}>
                  {idx + 1}
                </span>

                {/* Thumbnail / icon */}
                <div style={{
                  width: 72, height: 40, borderRadius: 6, flexShrink: 0,
                  background: "#CDDCD1", display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden",
                }}>
                  {item.type === "image"
                    ? <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 22 }}>🎬</span>
                  }
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#a3c0b2", marginTop: 2 }}>
                    {formatBytes(item.size)} · {formatDate(item.uploaded)}
                  </div>
                </div>

                {/* Badge */}
                <Badge type={item.type} />

                {/* Duration (bilder) */}
                {item.type === "image" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" min={1} max={120} value={item.duration}
                      onChange={(e) => setItems(prev => prev.map(i => i.key === item.key ? { ...i, duration: Number(e.target.value) } : i))}
                      style={{ width: 48, padding: "3px 6px", borderRadius: 6, border: "1.5px solid #a3c0b2", background: "#f5f8f6", color: "#1e4025", fontFamily: "inherit", fontSize: 13, textAlign: "center" as const }}
                    />
                    <span style={{ fontSize: 11, color: "#a3c0b2" }}>sek</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: "#a3c0b2", minWidth: 55 }}>Hel film</span>
                )}

                {/* Delete */}
                <button onClick={() => deleteItem(item.key)} disabled={deleting === item.key}
                  style={{
                    width: 28, height: 28, borderRadius: 7, border: "1.5px solid #f0d0d8",
                    background: "transparent", color: "#dd5c86", fontWeight: 700, fontSize: 16,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                  {deleting === item.key ? "…" : "×"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Setup guide ── */}
      <section style={{
        marginTop: 40, padding: "18px 20px", background: "#f5f8f6",
        borderRadius: 10, border: "1.5px solid #CDDCD1", fontSize: 12, color: "#1e4025", lineHeight: 1.8,
      }}>
        <strong style={{ display: "block", marginBottom: 8 }}>⚙️ Konfiguration (.env)</strong>
        <code style={{ display: "block", fontFamily: "monospace", color: "#555", fontSize: 11 }}>
          VITE_WORKER_URL=https://sodss-signage.ditt-konto.workers.dev<br />
          VITE_WORKER_SECRET=din-hemliga-nyckel<br />
          VITE_PLAYER_URL=https://din-url.se/player.html
        </code>
      </section>
    </div>
  );
}
