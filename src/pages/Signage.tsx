import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaType = "image" | "video" | "web";

interface PlaylistItem {
  id: string;
  type: MediaType;
  key?: string;        // R2-nyckel, endast image/video
  url: string;          // media-URL (image/video, ?v=etag) eller mål-URL (web)
  name: string;          // filnamn (image/video) eller URL (web) för visning
  duration: number;
  size?: number;
  uploaded?: string;
  etag?: string;
}

interface FileSchedule {
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
  weekdays?: number[];
}

type Schedules = Record<string, FileSchedule>;

interface Screen {
  id: string;
  name: string;
}

const DEFAULT_SCREENS: Screen[] = [
  { id: "reception", name: "Skärm Reception" },
  { id: "lounge", name: "Skärm Lounge" },
];

const WEEKDAYS = [
  { n: 1, label: "Mån" }, { n: 2, label: "Tis" }, { n: 3, label: "Ons" },
  { n: 4, label: "Tor" }, { n: 5, label: "Fre" }, { n: 6, label: "Lör" },
  { n: 7, label: "Sön" },
];

const WORKER_URL    = import.meta.env.VITE_WORKER_URL    ?? "";
const WORKER_SECRET = import.meta.env.VITE_WORKER_SECRET ?? "";

function authHeaders(): Record<string, string> {
  return WORKER_SECRET ? { Authorization: `Bearer ${WORKER_SECRET}` } : {};
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

function formatBytes(bytes?: number) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("sv-SE") : "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ type }: { type: MediaType }) {
  const styles: Record<MediaType, { bg: string; fg: string; label: string }> = {
    image: { bg: "#cfded2", fg: "#1a2e2e", label: "Bild" },
    video: { bg: "#dd5c86", fg: "#fff", label: "Video" },
    web:   { bg: "#a3c0b2", fg: "#1a2e2e", label: "Webb" },
  };
  const s = styles[type];
  return (
    <span
      className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
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
  // ── Skärmar ──────────────────────────────────────────────────────────────
  const [screens, setScreens]           = useState<Screen[]>(DEFAULT_SCREENS);
  const [screen, setScreen]             = useState<string>(DEFAULT_SCREENS[0].id);

  const [items, setItems]               = useState<PlaylistItem[]>([]);
  const [isDirty, setIsDirty]           = useState(false);
  const [loading, setLoading]           = useState(false);
  const [isSaving, setIsSaving]         = useState(false);
  const [saveMsg, setSaveMsg]           = useState<{ text: string; ok: boolean } | null>(null);
  const [dragOver, setDragOver]         = useState(false);
  const [jobs, setJobs]                 = useState<UploadJob[]>([]);
  const [dragId, setDragId]             = useState<string | null>(null);
  const [dragOverId, setDragOverId]     = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const savedItemsRef                   = useRef<PlaylistItem[]>([]);

  // ── Webblänk-formulär ────────────────────────────────────────────────────
  const [webUrlInput, setWebUrlInput]           = useState("");
  const [webDurationInput, setWebDurationInput] = useState(30);

  // ── Schedules (tidsstyrning, keyed på full R2-nyckel) ────────────────────
  const [schedules, setSchedules]           = useState<Schedules>({});
  const [scheduleTarget, setScheduleTarget] = useState<string | null>(null);
  const [schedDraft, setSchedDraft]         = useState<FileSchedule>({});
  const [schedSaving, setSchedSaving]       = useState(false);

  useEffect(() => {
    if (!WORKER_URL) return;
    fetch(`${WORKER_URL}/api/screens`)
      .then(r => r.json() as Promise<Screen[]>)
      .then(list => { if (Array.isArray(list) && list.length > 0) setScreens(list); })
      .catch(() => {});
  }, []);

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
      headers: { "Content-Type": "application/json", ...authHeaders() },
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

  // ── Hämta spellista (manifest + filmetadata) för vald skärm ─────────────
  const fetchPlaylist = useCallback(async () => {
    if (!WORKER_URL) return;
    setLoading(true);
    try {
      const [filesRes, playlistRes] = await Promise.all([
        fetch(`${WORKER_URL}/api/files?screen=${screen}`),
        fetch(`${WORKER_URL}/api/playlist/${screen}`),
      ]);
      const filesData = await filesRes.json() as { files: any[] };
      const manifestData = await playlistRes.json() as { items?: any[] };

      const filesByKey = new Map<string, any>(filesData.files.map((f: any) => [f.key, f]));
      const manifestItems = manifestData.items ?? [];

      const resolved: PlaylistItem[] = [];
      for (const it of manifestItems) {
        if (it.type === "web") {
          resolved.push({ id: it.id, type: "web", url: it.url, name: it.url, duration: it.duration ?? 30 });
          continue;
        }
        const file = filesByKey.get(it.key);
        resolved.push({
          id: it.id,
          type: it.type,
          key: it.key,
          url: file?.url ?? `${WORKER_URL}/media/${it.key}`,
          name: file?.name ?? it.key.split("/").pop() ?? it.key,
          duration: it.duration ?? 8,
          size: file?.size,
          uploaded: file?.uploaded,
          etag: file?.etag,
        });
        if (file) filesByKey.delete(it.key);
      }
      // Filer som finns i R2 men saknas i manifestet (t.ex. nyss uppladdade) läggs sist.
      // De är INTE en del av det sparade manifestet ännu — savedItemsRef speglar
      // därför bara manifest-delen, och listan markeras dirty så Spara-knappen
      // blir aktiv (annars syns filen i listan men saknas i den spellista som
      // spelaren faktiskt läser, utan att admin ser att något behöver sparas).
      const unsavedExtras: PlaylistItem[] = [];
      for (const file of filesByKey.values()) {
        const extra: PlaylistItem = {
          id: randomId(), type: file.type, key: file.key, url: file.url, name: file.name,
          duration: 8, size: file.size, uploaded: file.uploaded, etag: file.etag,
        };
        unsavedExtras.push(extra);
        resolved.push(extra);
      }

      setItems(resolved);
      savedItemsRef.current = resolved.slice(0, resolved.length - unsavedExtras.length);
      setIsDirty(unsavedExtras.length > 0);
    } catch (e) {
      console.error("Kunde inte hämta spellista:", e);
    } finally {
      setLoading(false);
    }
  }, [screen]);

  useEffect(() => { fetchPlaylist(); }, [fetchPlaylist]);

  function selectScreen(id: string) {
    if (id === screen) return;
    if (isDirty && !window.confirm("Du har osparade ändringar i spellistan. Byta skärm ändå?")) return;
    setScreen(id);
  }

  // ── Playlist Save/Undo ───────────────────────────────────────────────────
  async function handleSave() {
    if (!WORKER_URL) return;
    setIsSaving(true);
    try {
      const manifestItems = items.map(i => {
        if (i.type === "web") {
          return { id: i.id, type: "web", url: i.url, duration: i.duration };
        }
        return {
          id: i.id, type: i.type, key: i.key,
          duration: i.type === "image" ? i.duration : undefined,
        };
      });
      const res = await fetch(`${WORKER_URL}/api/playlist/${screen}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items: manifestItems }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      savedItemsRef.current = [...items];
      setIsDirty(false);
      setSaveMsg({ text: "Spellista sparad!", ok: true });
    } catch (e) {
      console.error("Kunde inte spara spellista:", e);
      setSaveMsg({ text: "Kunde inte spara spellistan", ok: false });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  function handleUndo() {
    setItems([...savedItemsRef.current]);
    setIsDirty(false);
  }

  // ── Webblänk ─────────────────────────────────────────────────────────────
  function addWebLink() {
    const url = webUrlInput.trim();
    if (!url) return;
    setItems(prev => [...prev, {
      id: randomId(), type: "web", url, name: url, duration: webDurationInput || 30,
    }]);
    setWebUrlInput("");
    setWebDurationInput(30);
    setIsDirty(true);
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
          xhr.open("POST", `${WORKER_URL}/api/upload?screen=${screen}`);
          const secret = authHeaders().Authorization;
          if (secret) xhr.setRequestHeader("Authorization", secret);
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

    await fetchPlaylist();
    setTimeout(() => {
      setJobs(prev => prev.filter(j => j.status !== "done"));
    }, 3000);
  }, [fetchPlaylist, screen]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (item: PlaylistItem) => {
    setDeleting(item.id);
    try {
      if (item.type !== "web" && item.key) {
        const fileName = item.key.slice(screen.length + 1);
        const res = await fetch(`${WORKER_URL}/api/files/${screen}/${encodeURIComponent(fileName)}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setItems(prev => prev.filter(i => i.id !== item.id));
      savedItemsRef.current = savedItemsRef.current.filter(i => i.id !== item.id);
      setConfirmDeleteId(null);
      setIsDirty(true);
    } catch (e: any) {
      alert(`Kunde inte ta bort filen. ${e.message}`);
    } finally {
      setDeleting(null);
    }
  }, [screen]);

  // ── Drag reorder ─────────────────────────────────────────────────────────
  const handleDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      setItems(prev => {
        const arr = [...prev];
        const from = arr.findIndex(i => i.id === dragId);
        const to   = arr.findIndex(i => i.id === dragOverId);
        const [el] = arr.splice(from, 1);
        arr.splice(to, 0, el);
        return arr;
      });
      setIsDirty(true);
    }
    setDragId(null);
    setDragOverId(null);
  };

  // ── Skärm-URL ────────────────────────────────────────────────────────────
  const screenPlayerUrl = (screenId: string) => `${WORKER_URL}/player?screen=${screenId}`;

  const totalDuration = items.reduce((acc, i) =>
    acc + (i.type === "video" ? 30 : i.duration), 0);

  const currentScreenName = screens.find(s => s.id === screen)?.name ?? screen;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="px-9 py-8 max-w-[980px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark m-0 tracking-tight">Skyltning</h1>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} objekt · ca {Math.round(totalDuration / 60)} min per loop
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className="text-[11px] font-semibold mr-1" style={{ color: saveMsg.ok ? "#009399" : "#dd5c86" }}>
              {saveMsg.text}
            </span>
          )}
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
            {isSaving ? "Sparar…" : "Spara spellista"}
          </button>
          <button
            className="sds-focus-ring"
            onClick={fetchPlaylist}
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

      {isDirty && (
        <div className="rounded-xl px-4 py-2.5 mb-5 text-[12px] font-semibold" style={{ background: "#fdf2f6", color: "#dd5c86", border: "1px solid #f0d0d8" }}>
          Osparade ändringar — glöm inte att trycka <em>Spara spellista</em>.
        </div>
      )}

      {/* ── Skärmväljare ── */}
      <section className="mb-6">
        <div className="flex gap-2 flex-wrap mb-3">
          {screens.map(s => (
            <button
              key={s.id}
              className="sds-focus-ring"
              onClick={() => selectScreen(s.id)}
              style={{
                minHeight: 40, padding: "8px 18px", borderRadius: 10,
                border: `1.5px solid ${screen === s.id ? "#1a2e2e" : "#cfded2"}`,
                background: screen === s.id ? "#1a2e2e" : "transparent",
                color: screen === s.id ? "#cfded2" : "#1a2e2e",
                fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              📺 {s.name}
            </button>
          ))}
        </div>

        <div className="card p-4">
          <div className="text-[11px] text-slate-400 mb-1.5">URL för {currentScreenName}</div>
          <div
            className="text-[11px] font-mono rounded-lg px-3 py-2 mb-3 break-all"
            style={{ background: "#f0faf4", color: "#1a2e2e" }}
          >
            {screenPlayerUrl(screen)}
          </div>
          <div className="flex gap-2 flex-wrap">
            <CopyButton text={screenPlayerUrl(screen)} />
            <a
              className="sds-focus-ring"
              href={screenPlayerUrl(screen)}
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
      <section className="mb-5">
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
            Dra och släpp bilder eller filmer här — till {currentScreenName}
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

      {/* ── Lägg till webblänk ── */}
      <section className="mb-7">
        <div className="card p-4">
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-slate-400 mb-2.5">
            Lägg till webblänk
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="url"
              value={webUrlInput}
              onChange={e => setWebUrlInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addWebLink()}
              placeholder="https://..."
              className="sds-focus-ring flex-1 min-w-[220px] font-mono text-brand-dark rounded-lg outline-none"
              style={{
                border: "1.5px solid #cfded2", fontSize: 12,
                padding: "8px 10px", fontFamily: "inherit",
              }}
            />
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={600}
                value={webDurationInput}
                onChange={e => setWebDurationInput(Number(e.target.value))}
                className="sds-focus-ring text-center text-brand-dark"
                style={{
                  width: 64, minHeight: 38, padding: "7px 8px", borderRadius: 7,
                  border: "1.5px solid #cfded2", background: "#f8faf9",
                  fontFamily: "inherit", fontSize: 13,
                }}
              />
              <span className="text-[11px] text-slate-400">sek</span>
            </div>
            <button
              className="sds-focus-ring"
              onClick={addWebLink}
              disabled={!webUrlInput.trim()}
              style={{
                minHeight: 38, padding: "8px 18px", borderRadius: 9, border: "none",
                background: webUrlInput.trim() ? "#1a2e2e" : "#e8eeeb",
                color: webUrlInput.trim() ? "#cfded2" : "#b8cec5",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                cursor: webUrlInput.trim() ? "pointer" : "not-allowed",
                whiteSpace: "nowrap" as const,
              }}
            >
              Lägg till
            </button>
          </div>
        </div>
      </section>

      {/* ── Playlist ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-bold tracking-[0.12em] uppercase text-slate-400 m-0">
            Spellista — {currentScreenName}
          </h2>
          <span className="text-[11px] text-slate-400">Dra för att ändra ordning</span>
        </div>

        {loading && items.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">Laddar…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            Inga objekt än. Ladda upp något eller lägg till en webblänk ovan!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragEnter={() => setDragOverId(item.id)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 rounded-2xl px-4 py-2.5 cursor-grab"
                style={{
                  background: dragOverId === item.id ? "#f0faf4" : "#fff",
                  border: `1.5px solid ${dragOverId === item.id ? "#1a2e2e" : "#e2e8f0"}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  opacity: dragId === item.id ? 0.4 : 1,
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
                    : item.type === "video"
                    ? <span className="text-2xl">🎬</span>
                    : <span className="text-2xl">🔗</span>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-brand-dark truncate">{item.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {item.type === "web" ? "Webblänk" : `${formatBytes(item.size)} · ${formatDate(item.uploaded)}`}
                  </div>
                </div>

                {/* Badge */}
                <Badge type={item.type} />

                {/* Duration */}
                {item.type !== "video" ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={item.duration}
                      onChange={(e) => {
                        setItems(prev =>
                          prev.map(i => i.id === item.id ? { ...i, duration: Number(e.target.value) } : i)
                        );
                        setIsDirty(true);
                      }}
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

                {/* Schedule (endast bild/video, har R2-nyckel) */}
                {item.key && (
                  <button
                    className="sds-focus-ring flex-shrink-0 flex items-center justify-center text-sm"
                    onClick={() => openSchedule(item.key!)}
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
                )}

                {/* Delete */}
                {confirmDeleteId === item.id ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[11px] font-bold" style={{ color: "#dd5c86" }}>Ta bort?</span>
                    <button
                      className="sds-focus-ring"
                      onClick={() => deleteItem(item)}
                      disabled={deleting === item.id}
                      style={{
                        minWidth: 40, minHeight: 36, borderRadius: 7, border: "none",
                        background: "#dd5c86", color: "#fff", fontWeight: 700, fontSize: 12,
                        cursor: deleting === item.id ? "wait" : "pointer",
                      }}
                    >
                      {deleting === item.id ? "…" : "Ja"}
                    </button>
                    <button
                      className="sds-focus-ring"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting === item.id}
                      style={{
                        minWidth: 54, minHeight: 36, borderRadius: 7,
                        border: "1.5px solid #cfded2", background: "transparent",
                        color: "#1a2e2e", fontWeight: 700, fontSize: 12,
                        cursor: deleting === item.id ? "default" : "pointer",
                      }}
                    >
                      Avbryt
                    </button>
                  </div>
                ) : (
                  <button
                    className="sds-focus-ring flex-shrink-0 flex items-center justify-center"
                    onClick={() => setConfirmDeleteId(item.id)}
                    disabled={deleting === item.id}
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
