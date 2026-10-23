// Tidsstyrning för Skyltning: hämtning och sparning mot signage-workerns /api/schedules.
// Utan importer, så att logiken kan testas direkt med node --test (tests/signage/).

export interface FileSchedule {
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
  weekdays?: number[];
}

export type Schedules = Record<string, FileSchedule>;

export type SaveScheduleResult =
  | { ok: true; schedules: Schedules; etag: string | null }
  | { ok: false; kind: "auth" | "conflict" | "invalid" | "error"; message: string };

export const SCHEDULE_MESSAGES = {
  auth: "Din inloggning har gått ut eller saknar behörighet. Logga in igen och försök på nytt.",
  conflict: "Någon annan har ändrat tidsstyrningen. Den senaste versionen har hämtats – kontrollera och spara igen.",
  error: "Kunde inte spara tidsstyrningen. Försök igen.",
} as const;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Lägger in (eller tar bort, om utkastet är tomt) en post i en kopia av kartan.
export function applyScheduleDraft(schedules: Schedules, key: string, draft: FileSchedule): Schedules {
  const next: Schedules = { ...schedules };
  const clean: FileSchedule = { ...draft };
  if (!clean.dateFrom) delete clean.dateFrom;
  if (!clean.dateTo) delete clean.dateTo;
  if (!clean.timeFrom) delete clean.timeFrom;
  if (!clean.timeTo) delete clean.timeTo;
  if (!clean.weekdays?.length) delete clean.weekdays;
  if (Object.keys(clean).length === 0) {
    delete next[key];
  } else {
    next[key] = clean;
  }
  return next;
}

// Samma ordningsregler som workerns validering, så att dialogen kan stoppa
// sparningen innan den skickas. Tider över midnatt (22:00–02:00) stöds inte.
export function scheduleDraftProblem(draft: FileSchedule): string | null {
  if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
    return "Startdatum är efter slutdatum.";
  }
  if (draft.timeFrom && draft.timeTo && draft.timeFrom > draft.timeTo) {
    return "Starttiden är efter sluttiden. Tider över midnatt stöds inte.";
  }
  return null;
}

function isSchedules(value: unknown): value is Schedules {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function fetchSchedules(
  workerUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ schedules: Schedules; etag: string | null }> {
  const res = await fetchImpl(`${workerUrl}/api/schedules`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  return { schedules: isSchedules(body) ? body : {}, etag: res.headers.get("ETag") };
}

async function readServerError(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Inget JSON-fel att visa – faller tillbaka på den allmänna texten.
  }
  return null;
}

// Sparar hela kartan. Kastar aldrig: alla fel blir ett SaveScheduleResult som
// dialogen kan visa, så att den inte stängs som om sparningen lyckats.
export async function putSchedules(opts: {
  workerUrl: string;
  schedules: Schedules;
  etag: string | null;
  getAuthHeaders: () => Promise<Record<string, string>>;
  fetchImpl?: FetchLike;
}): Promise<SaveScheduleResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  let auth: Record<string, string>;
  try {
    auth = await opts.getAuthHeaders();
  } catch {
    return { ok: false, kind: "auth", message: SCHEDULE_MESSAGES.auth };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", ...auth };
  if (opts.etag) headers["If-Match"] = opts.etag;

  let res: Response;
  try {
    res = await fetchImpl(`${opts.workerUrl}/api/schedules`, {
      method: "PUT",
      headers,
      body: JSON.stringify(opts.schedules),
    });
  } catch {
    return { ok: false, kind: "error", message: SCHEDULE_MESSAGES.error };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: "auth", message: SCHEDULE_MESSAGES.auth };
  }
  if (res.status === 409) {
    return { ok: false, kind: "conflict", message: SCHEDULE_MESSAGES.conflict };
  }
  if (res.status === 400) {
    const detail = await readServerError(res);
    return {
      ok: false,
      kind: "invalid",
      message: detail ? `Kunde inte spara tidsstyrningen: ${detail}` : SCHEDULE_MESSAGES.error,
    };
  }
  if (!res.ok) {
    return { ok: false, kind: "error", message: SCHEDULE_MESSAGES.error };
  }

  let saved: Schedules = opts.schedules;
  try {
    const body: unknown = await res.json();
    if (body !== null && typeof body === "object" && "schedules" in body && isSchedules(body.schedules)) {
      saved = body.schedules;
    }
  } catch {
    // Äldre worker utan svar med kartan – det vi skickade gäller.
  }
  return { ok: true, schedules: saved, etag: res.headers.get("ETag") };
}
