// 端末内ストレージ（NFR-05：外部サーバーへは一切送信しない）

const KEY_CALENDARS = "mycal.calendars";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage に保存できませんでした", e);
  }
}

/* ---- 取り込むカレンダーのオン/オフ（FR-08） ---- */

export function loadCalendarPrefs() {
  return read(KEY_CALENDARS, {});
}

export function setCalendarEnabled(calendarId, enabled) {
  const prefs = loadCalendarPrefs();
  prefs[calendarId] = !!enabled;
  write(KEY_CALENDARS, prefs);
}

/* ---- 予定のキャッシュ（FR-29 / FR-30） ---- */

const KEY_CACHE = "mycal.cache";

/** 取得済みの予定を端末に保存する。通信できないときはこれを表示し続ける。 */
export function saveCache({ events, holidays, calendars, savedAt }) {
  write(KEY_CACHE, {
    savedAt: savedAt.toISOString(),
    calendars,
    holidays: [...holidays.entries()],
    events: events.map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() })),
  });
}

export function loadCache() {
  const raw = read(KEY_CACHE, null);
  if (!raw?.events) return null;
  return {
    savedAt: new Date(raw.savedAt),
    calendars: raw.calendars ?? [],
    holidays: new Map(raw.holidays ?? []),
    events: raw.events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) })),
  };
}

export function clearCache() {
  localStorage.removeItem(KEY_CACHE);
}

/* ---- 表示モード（2週間 / 1ヶ月） ---- */

const KEY_VIEW_MODE = "mycal.viewMode";

export function loadViewMode() {
  const value = localStorage.getItem(KEY_VIEW_MODE);
  return value === "month" ? "month" : "2weeks"; // 既定は2週間
}

export function saveViewMode(mode) {
  localStorage.setItem(KEY_VIEW_MODE, mode);
}

/** 未設定のカレンダーは既定でオン */
export function isCalendarEnabled(calendarId, prefs = loadCalendarPrefs()) {
  return prefs[calendarId] !== false;
}
