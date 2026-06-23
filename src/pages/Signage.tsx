import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaType = "image" | "video";

interface PlaylistItem {
  key: string;
  name: string;
  type: MediaType;
  url: string;
  size: number;
  uploaded: string;
  duration: number;
}

interface FileSchedule {
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
  weekdays?: number[];
}

type Schedules = Record<string, FileSchedule>;

const WEEKDAYS = [
  { n: 1, label: "Mån" }, { n: 2, label: "Tis" }, { n: 3, label: "Ons" },
  { n: 4, label: "Tor" }, { n: 5, label: "Fre" }, { n: 6, label: "Lör" },
  { n: 7, label: "Sön" },
];

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? "";
const PLAYER_URL = import.meta.env.VITE_PLAYER_URL ?? "/player.html";

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
    <span
      className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
      style={{
        background: type === "image" ? "#cfded2" : "#dd5c86",
        color: type === "image" ? "#1a2e2e" : "#fff",
      }}
    >
      {type === "image" ? "Bild" : "Video"}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="sds-focus-ring"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        minHeight: 34, padding: "5px 12px", borderRadius: 7,
        border: copied ? "none" : "1.5px solid #cfded2",
        background: copied ? "#1a2e2e" : "#f8faf9",
        color: copied ? "#fff" : "#1a2e2e",
        fontFamily: "inherit", fontSize: 12, fontWeight: 600,
        cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" as const,
      }}
    >
      {copied ? "✓ Kopierad" : "Kopiera URL"}
    </button>
  );
}

interface UploadJob {
  file: File;
  progress: number;
  status: "waiting" | "uploading" | "done" | "error";
  errorMsg?: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Signage() {
  const [items, setItems]               = useState<PlaylistItem[]>([]);
  const [savedItems, setSavedItems]     = useState<PlaylistItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [isSaving, setIsSaving]         = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const [jobs, setJobs]                 = useState<UploadJob[]>([]);
  const [dragId, setDragId]             = useState<string | null>(null);
  const [dragOverId, setDragOverId]     = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const isDirty = useMemo(() => {
    if (savedItems.length !== items.length) return true;
    return items.some((item, idx) =>
      item.key !== savedItems[idx]?.key || item.duration !== savedItems[idx]?.duration
    );
  }, [items, savedItems]);

  // ── Schedules ────────────────────────────────────────────────────────────
  const [schedules, setSchedules]           = useState<Schedules>({});
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null);
  const [schedDraft, setSchedDraft]         = useState<FileSchedule>({});
  const [schedSaving, setSchedSaving]       = useState(false);

  useEffect(() => {
    if (!WORKER_URL) return;
    fetch(`${WORKER_URL}/api/schedules`)
      .then(r => r.json() as Promise<Schedules>)
      .then(setSchedules)
      .catch(() => {});
  }, []);

  function openSchedule(key: string) {
    setScheduleTarget(key);
    setSchedDraft(schedules[key] ?? {});
  }

  async function saveSchedule() {
    if (!scheduleTarget) return;
    setSchedSaving(true);
    const next = { ...schedules };
    const draft = { ...schedDraft };
    if (!draft.dateFrom) delete draft.dateFrom;
    if (!draft.dateTo)   delete draft.dateTo;
    if (!draft.timeFrom) delete draft.timeFrom;
    if (!draft.timeTo)   delete draft.timeTo;
    if (!draft.weekdays?.length) delete draft.weekdays;
    if (Object.keys(draft).length === 0) {
      delete next[scheduleTarget];
    } else {
      next[scheduleTarget] = draft;
    }
    await fetch(`${WORKER_URL}/api/schedules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSchedules(next);
    setScheduleTarget(null);
    setSchedSaving(false);
  }

  function toggleWeekday(n: number) {
    const current = schedDraft.weekdays ?? [];
    setSchedDraft(d => ({
      ...d,
      weekdays: current.includes(n) ? current.filter(x => x !== n) : [...current, n].sort(),
    }));
  }

  // ── Studio B URL state ───────────────────────────────────────────────────
  const [studioBUrl, setStudioBUrl]     = useState("");
  const [studioBInput, setStudioBInput] = useState("");
  const [studioBSaving, setStudioBSaving] = useState(false);
  const [studioBMsg, setStudioBMsg]     = useState<{ text: string; ok: boolean } | null>(null);

  const studioBRedirectUrl =
    `https://core.sollentunadansochscenskola.se/redirect.html?screen=studio-b&worker=${encodeURIComponent(WORKER_URL)}`;

  useEffect(() => {
    if (!WORKER_URL) return;
    fetch(`${WORKER_URL}/api/url/studio-b`)
      .then(r => r.json() as Promise<{ url: string }>)
      .then(d => { setStudioBUrl(d.url); setStudioBInput(d.url); })
      .catch(() => {});
  }, []);

  async function saveStudioBUrl() {
    if (!studioBInput.trim()) return;
    setStudioBSaving(true);
    setStudioBMsg(null);
    try {
      const res = await fetch(`${WORKER_URL}/api/url/studio-b`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: studioBInput.trim() }),
      });
      if (!res.ok) throw new Error();
      setStudioBUrl(studioBInput.trim());
      setStudioBMsg({ text: "Sparad!", ok: true });
    } catch {
      setStudioBMsg({ text: "Kunde inte spara", ok: false });
    } finally {
      setStudioBSaving(false);
      setTimeout(() => setStudioBMsg(null), 3000);
    }
  }

  // ── Fetch file list ──────────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (!WORKER_URL) return;
    setLoading(true);
    try {
      const [filesRes, playlistRes] = await Promise.all([
        fetch(`${WORKER_URL}/api/files`),
        fetch(`${WORKER_URL}/api/playlist`).catch(() => null),
      ]);
      const filesData = await filesRes.json() as { files: any[] };
      const playlistData = playlistRes
        ? await playlistRes.json().catch(() => null) as { order: string[]; durations: Record<string, number> } | null
        : null;

      const durations: Record<string, number> = playlistData?.durations ?? {};
      let files: PlaylistItem[] = filesData.files.map(f => ({
        ...f,
        duration: durations[f.key] ?? 8,
      }));

      const order = playlistData?.order ?? [];
      if (order.length > 0) {
        const ordered: PlaylistItem[] = [];
        for (const key of order) {
          const item = files.find(f => f.key === key);
          if (item) ordered.push(item);
        }
        for (const f of files) {
          if (!ordered.find(o => o.key === f.key)) ordered.push(f);
        }
        files = ordered;
      }

      setItems(files);
      setSavedItems(files);
    } catch (e) {
      console.error("Kunde inte hämta filer:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ── Playlist Save/Undo ───────────────────────────────────────────────────
  async function handleSave() {
    if (!WORKER_URL) return;
    setIsSaving(true);
    try {
      const order = items.map(i => i.key);
      const durations = Object.fromEntries(
        items.filter(i => i.type === "image").map(i => [i.key, i.duration])
      );
      await fetch(`${WORKER_URL}/api/playlist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, durations }),
      });
      setSavedItems([...items]);
    } catch (e) {
      console.error("Kunde inte spara spellista:", e);
    } finally {
      setIsSaving(false);
    }
  }

  function handleUndo() {
    setItems([...savedItems]);
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files: FileList) => {
    const newJobs: UploadJob[] = Array.from(files).map(f => ({
      file: f, progress: 0, status: "waiting",
    }));
    setJobs(prev => [...prev, ...newJobs]);

    for (let i = 0; i < newJobs.length; i++) {
      const job = newJobs[i];
      setJobs(prev => prev.map(j => j.file === job.file ? { ...j, status: "uploading" } : j));
      try {
        const formData = new FormData();
        formData.append("file", job.file);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${WORKER_URL}/api/upload`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setJobs(prev => prev.map(j => j.file === job.file ? { ...j, progress: pct } : j));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setJobs(prev => prev.map(j => j.file === job.file ? { ...j, status: "done", progress: 100 } : j));
              resolve();
            } else {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Nätverksfel"));
          xhr.send(formData);
        });
      } catch (e: any) {
        setJobs(prev => prev.map(j => j.file === job.file ? { ...j, status: "error", errorMsg: e.message } : j));
      }
    }

    await fetchFiles();
    setTimeout(() => {
      setJobs(prev => prev.filter(j => j.status !== "done"));
    }, 3000);
  }, [fetchFiles]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (key: string) => {
    setDeleting(key);
    try {
      await fetch(`${WORKER_URL}/api/files/${encodeURIComponent(key)}`, { method: "DELETE" });
      setItems(prev => prev.filter(i => i.key !== key));
      setSavedItems(prev => prev.filter(i => i.key !== key));
      setConfirmDeleteKey(null);
    } catch {
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
    setDragId(null);
    setDragOverId(null);
  };

  // ── Player URL ───────────────────────────────────────────────────────────
  const screenUrl = (screenId: string) =>
    `${PLAYER_URL}?worker=${encodeURIComponent(WORKER_URL)}&screen=${screenId}`;

  const totalDuration = items.reduce((acc, i) =>
    acc + (i.type === "image" ? i.duration : 30), 0);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="px-9 py-8 max-w-[980px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark m-0 tracking-tight">Skyltning</h1>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} objekt · ca {Math.round(totalDuration / 60)} min per loop
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="sds-focus-ring"
            onClick={handleUndo}
            disabled={!isDirty || isSaving}
            style={{
              minHeight: 36, padding: "7px 16px", borderRadius: 9,
              border: `1.5px solid ${isDirty ? "#cfded2" : "#e8eeeb"}`,
              background: "transparent",
              color: isDirty ? "#1a2e2e" : "#b8cec5",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              cursor: isDirty && !isSaving ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            Ångra
          </button>
          <button
            className="sds-focus-ring"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            style={{
              minHeight: 36, padding: "7px 18px", borderRadius: 9, border: "none",
              background: isDirty ? "#1a2e2e" : "#e8eeeb",
              color: isDirty ? "#cfded2" : "#b8cec5",
              fontFamily: "inherit", fontSize: 13, fontWeight: 700,
              cursor: isDirty && !isSaving ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {isSaving ? "Sparar…" : "Spara"}
          </button>
          <button
            className="sds-focus-ring"
            onClick={fetchFiles}
            disabled={loading}
            style={{
              minHeight: 36, padding: "7px 16px", borderRadius: 9, border: "none",
              background: "#cfded2", color: "#1a2e2e",
              fontFamily: "inherit", fontSize: 13, fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "⏳ Laddar…" : "↻ Uppdatera"}
          </button>
        </div>
      </div>

      {/* ── Config warning ── */}
      {!WORKER_URL && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-700">
          ⚠️ <strong>Skyltning är inte konfigurerad.</strong> Sätt upp Cloudflare Worker innan vyn används.
        </div>
      )}

      {/* ── Screens ── */}
      <section className="mb-8">
        <h2 className="text-[11px] font-bold tracking-[0.12em] uppercase text-slate-400 mb-3">
          Skärmar
        </h2>
        <div className="flex gap-3 flex-wrap">
          {[
            { id: "reception", name: "Receptionen" },
            { id: "studio-a",  name: "Studio A" },
          ].map(s => (
            <div key={s.id} className="card p-4 flex-1 min-w-[260px]">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-brand-dark text-sm">📺 {s.name}</span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{ background: "#f0faf4", color: "#1a2e2e", border: "1px solid #cfded2" }}
                >
                  LIVE
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mb-3 font-mono break-all">
                {screenUrl(s.id)}
              </div>
              <div className="flex gap-2">
                <CopyButton text={screenUrl(s.id)} />
                <a
                  className="sds-focus-ring"
                  href={screenUrl(s.id)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    minHeight: 34, padding: "5px 12px", borderRadius: 7,
                    border: "1.5px solid #cfded2",
                    background: "transparent", color: "#1a2e2e",
                    fontSize: 12, fontWeight: 600, textDecoration: "none",
                    display: "inline-flex", alignItems: "center",
                  }}
                >
                  Förhandsgranska ↗
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* ── Studio B — URL-styrning ── */}
        <div className="card p-4 mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-brand-dark text-sm">📺 Studio B</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded"
              style={{ background: "#f0faf4", color: "#1a2e2e", border: "1px solid #cfded2" }}
            >
              URL-STYRNING
            </span>
          </div>

          <div className="text-[11px] text-slate-400 mb-1.5">Aktuell URL</div>
          <div
            className="text-[11px] font-mono rounded-lg px-3 py-2 mb-3 break-all"
            style={{ background: "#f0faf4", color: "#1a2e2e" }}
          >
            {studioBUrl || "—"}
          </div>

          <div className="flex gap-2 mb-3">
            <input
              type="url"
              value={studioBInput}
              onChange={e => setStudioBInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveStudioBUrl()}
              placeholder="https://..."
              className="sds-focus-ring flex-1 font-mono text-brand-dark rounded-lg outline-none"
              style={{
                border: "1.5px solid #cfded2", fontSize: 12,
                padding: "7px 10px", fontFamily: "inherit",
              }}
            />
            <button
              className="sds-focus-ring"
              onClick={saveStudioBUrl}
              disabled={studioBSaving}
              style={{
                minHeight: 36, padding: "6px 16px", borderRadius: 7, border: "none",
                background: studioBSaving ? "#cfded2" : "#1a2e2e",
                color: studioBSaving ? "#1a2e2e" : "#fff",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                cursor: studioBSaving ? "default" : "pointer",
                whiteSpace: "nowrap" as const,
              }}
            >
              {studioBSaving ? "Sparar…" : "Spara URL"}
            </button>
          </div>

          {studioBMsg && (
            <div
              className="text-[11px] mb-2"
              style={{ color: studioBMsg.ok ? "#009399" : "#dd5c86" }}
            >
              {studioBMsg.text}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <CopyButton text={studioBRedirectUrl} />
            <a
              className="sds-focus-ring"
              href={studioBRedirectUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                minHeight: 34, padding: "5px 12px", borderRadius: 7,
                border: "1.5px solid #cfded2",
                background: "transparent", color: "#1a2e2e",
                fontSize: 12, fontWeight: 600, textDecoration: "none",
                display: "inline-flex", alignItems: "center",
              }}
            >
              Förhandsgranska ↗
            </a>
          </div>
        </div>
      </section>

      {/* ── Upload jobs ── */}
      {jobs.length > 0 && (
        <section className="mb-5">
          <div className="flex flex-col gap-1.5">
            {jobs.map((job, i) => (
              <div key={i} className="card px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-brand-dark">{job.file.name}</span>
                  <span
                    className="text-[11px]"
                    style={{
                      color: job.status === "error" ? "#dd5c86"
                        : job.status === "done" ? "#009399"
                        : "#94a3b8",
                    }}
                  >
                    {job.status === "done" ? "✓ Klar"
                      : job.status === "error" ? `✗ ${job.errorMsg}`
                      : `${job.progress}%`}
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "#cfded2" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${job.progress}%`,
                      background: job.status === "error" ? "#dd5c86" : "#1a2e2e",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Drop zone ── */}
      <section className="mb-7">
        <div
          className="sds-focus-ring"
          role="button"
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={{
            border: `2px dashed ${dragOver ? "#1a2e2e" : "#cfded2"}`,
            borderRadius: 14, padding: "36px 24px", textAlign: "center" as const,
            cursor: "pointer",
            background: dragOver ? "#f0faf4" : "#fafcfb",
            transition: "all 0.2s",
          }}
        >
          <div className="text-3xl mb-2">⬆</div>
          <div className="text-sm font-semibold text-brand-dark">
            Dra och släpp bilder eller filmer här
          </div>
          <div className="text-xs text-slate-400 mt-1">
            JPG, PNG, WebP, MP4, MOV, WebM · Laddas upp direkt till Cloudflare R2
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); }}
          />
        </div>
      </section>

      {/* ── Playlist ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-bold tracking-[0.12em] uppercase text-slate-400 m-0">
            Spellista
          </h2>
          <span className="text-[11px] text-slate-400">Dra för att ändra ordning</span>
        </div>

        {loading && items.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">Laddar…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            Inga filer än. Ladda upp något ovan!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => setDragId(item.key)}
                onDragEnter={() => setDragOverId(item.key)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 rounded-2xl px-4 py-2.5 cursor-grab"
                style={{
                  background: dragOverId === item.key ? "#f0faf4" : "#fff",
                  border: `1.5px solid ${dragOverId === item.key ? "#1a2e2e" : "#e2e8f0"}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  opacity: dragId === item.key ? 0.4 : 1,
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Nr */}
                <span className="w-5 text-xs text-slate-400 font-bold text-right flex-shrink-0">
                  {idx + 1}
                </span>

                {/* Thumbnail */}
                <div
                  className="flex-shrink-0 rounded-md overflow-hidden flex items-center justify-center"
                  style={{ width: 72, height: 40, background: "#cfded2" }}
                >
                  {item.type === "image"
                    ? <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">🎬</span>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-brand-dark truncate">{item.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {formatBytes(item.size)} · {formatDate(item.uploaded)}
                  </div>
                </div>

                {/* Badge */}
                <Badge type={item.type} />

                {/* Duration */}
                {item.type === "image" ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={item.duration}
                      onChange={(e) =>
                        setItems(prev =>
                          prev.map(i => i.key === item.key ? { ...i, duration: Number(e.target.value) } : i)
                        )
                      }
                      className="sds-focus-ring text-center text-brand-dark"
                      style={{
                        width: 56, minHeight: 36, padding: "6px 8px", borderRadius: 7,
                        border: "1.5px solid #cfded2", background: "#f8faf9",
                        fontFamily: "inherit", fontSize: 13,
                      }}
                    />
                    <span className="text-[11px] text-slate-400">sek</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 min-w-[55px]">Hel film</span>
                )}

                {/* Schedule */}
                <button
                  className="sds-focus-ring flex-shrink-0 flex items-center justify-center text-sm"
                  onClick={() => openSchedule(item.key)}
                  title="Tidsstyrning"
                  style={{
                    width: 40, height: 40, borderRadius: 9,
                    border: `1.5px solid ${schedules[item.key] ? "#1a2e2e" : "#cfded2"}`,
                    background: schedules[item.key] ? "#cfded2" : "transparent",
                    color: schedules[item.key] ? "#1a2e2e" : "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  🕐
                </button>

                {/* Delete */}
                {confirmDeleteKey === item.key ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[11px] font-bold" style={{ color: "#dd5c86" }}>Ta bort?</span>
                    <button
                      className="sds-focus-ring"
                      onClick={() => deleteItem(item.key)}
                      disabled={deleting === item.key}
                      style={{
                        minWidth: 40, minHeight: 36, borderRadius: 7, border: "none",
                        background: "#dd5c86", color: "#fff", fontWeight: 700, fontSize: 12,
                        cursor: deleting === item.key ? "wait" : "pointer",
                      }}
                    >
                      {deleting === item.key ? "…" : "Ja"}
                    </button>
                    <button
                      className="sds-focus-ring"
                      onClick={() => setConfirmDeleteKey(null)}
                      disabled={deleting === item.key}
                      style={{
                        minWidth: 54, minHeight: 36, borderRadius: 7,
                        border: "1.5px solid #cfded2", background: "transparent",
                        color: "#1a2e2e", fontWeight: 700, fontSize: 12,
                        cursor: deleting === item.key ? "default" : "pointer",
                      }}
                    >
                      Avbryt
                    </button>
                  </div>
                ) : (
                  <button
                    className="sds-focus-ring flex-shrink-0 flex items-center justify-center"
                    onClick={() => setConfirmDeleteKey(item.key)}
                    disabled={deleting === item.key}
                    aria-label={`Förbered borttagning av ${item.name}`}
                    style={{
                      width: 40, height: 40, borderRadius: 9,
                      border: "1.5px solid #f0d0d8", background: "transparent",
                      color: "#dd5c86", fontWeight: 700, fontSize: 16, cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Schema-modal ── */}
      {scheduleTarget && (
        <>
          <div
            onClick={() => setScheduleTarget(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 90 }}
          />
          <div
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              background: "#fff", borderRadius: 16, padding: 24, zIndex: 91,
              width: 380, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,.18)",
            }}
          >
            <div className="flex justify-between items-center mb-5">
              <strong className="text-sm text-brand-dark">Tidsstyrning</strong>
              <button
                className="sds-focus-ring"
                onClick={() => setScheduleTarget(null)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" }}
              >
                ×
              </button>
            </div>
            <div className="text-[11px] text-slate-400 mb-4 break-all">{scheduleTarget}</div>

            {/* Datum */}
            <div className="mb-4">
              <div className="text-[11px] font-bold text-brand-dark uppercase tracking-[0.08em] mb-1.5">
                Datumintervall
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={schedDraft.dateFrom ?? ""}
                  onChange={e => setSchedDraft(d => ({ ...d, dateFrom: e.target.value || undefined }))}
                  className="flex-1 rounded-lg text-brand-dark"
                  style={{ padding: "5px 8px", border: "1.5px solid #cfded2", fontFamily: "inherit", fontSize: 12, color: "#1a2e2e" }}
                />
                <span className="text-[11px] text-slate-400">→</span>
                <input
                  type="date"
                  value={schedDraft.dateTo ?? ""}
                  onChange={e => setSchedDraft(d => ({ ...d, dateTo: e.target.value || undefined }))}
                  className="flex-1 rounded-lg"
                  style={{ padding: "5px 8px", border: "1.5px solid #cfded2", fontFamily: "inherit", fontSize: 12, color: "#1a2e2e" }}
                />
              </div>
            </div>

            {/* Tid */}
            <div className="mb-4">
              <div className="text-[11px] font-bold text-brand-dark uppercase tracking-[0.08em] mb-1.5">
                Tid på dygnet
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  value={schedDraft.timeFrom ?? ""}
                  onChange={e => setSchedDraft(d => ({ ...d, timeFrom: e.target.value || undefined }))}
                  className="flex-1 rounded-lg"
                  style={{ padding: "5px 8px", border: "1.5px solid #cfded2", fontFamily: "inherit", fontSize: 12, color: "#1a2e2e" }}
                />
                <span className="text-[11px] text-slate-400">→</span>
                <input
                  type="time"
                  value={schedDraft.timeTo ?? ""}
                  onChange={e => setSchedDraft(d => ({ ...d, timeTo: e.target.value || undefined }))}
                  className="flex-1 rounded-lg"
                  style={{ padding: "5px 8px", border: "1.5px solid #cfded2", fontFamily: "inherit", fontSize: 12, color: "#1a2e2e" }}
                />
              </div>
            </div>

            {/* Veckodagar */}
            <div className="mb-5">
              <div className="text-[11px] font-bold text-brand-dark uppercase tracking-[0.08em] mb-2">
                Veckodagar
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map(({ n, label }) => {
                  const active = (schedDraft.weekdays ?? []).includes(n);
                  return (
                    <button
                      key={n}
                      className="sds-focus-ring"
                      onClick={() => toggleWeekday(n)}
                      style={{
                        minWidth: 44, minHeight: 32, padding: "4px 10px", borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${active ? "#1a2e2e" : "#cfded2"}`,
                        background: active ? "#1a2e2e" : "transparent",
                        color: active ? "#cfded2" : "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-400 mt-1.5">Tomt = alla dagar</div>
            </div>

            {/* Knappar */}
            <div className="flex gap-2 justify-between">
              <button
                className="sds-focus-ring"
                onClick={() => setSchedDraft({})}
                style={{
                  minHeight: 36, padding: "7px 14px", borderRadius: 7,
                  border: "1.5px solid #f0d0d8", background: "transparent",
                  color: "#dd5c86", fontSize: 12, cursor: "pointer",
                }}
              >
                Rensa schema
              </button>
              <div className="flex gap-2">
                <button
                  className="sds-focus-ring"
                  onClick={() => setScheduleTarget(null)}
                  style={{
                    minHeight: 36, padding: "7px 14px", borderRadius: 7,
                    border: "1.5px solid #cfded2", background: "transparent",
                    color: "#64748b", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Avbryt
                </button>
                <button
                  className="sds-focus-ring"
                  onClick={saveSchedule}
                  disabled={schedSaving}
                  style={{
                    minHeight: 36, padding: "7px 18px", borderRadius: 7, border: "none",
                    background: "#1a2e2e", color: "#cfded2",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {schedSaving ? "Sparar…" : "Spara"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
