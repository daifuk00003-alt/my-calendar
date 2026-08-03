// 端末内ストレージ（NFR-05：外部サーバーへは一切送信しない）

const KEY_TOKEN = "mycal.token";
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

/* ---- OAuth トークン ---- */

export function saveToken(accessToken, expiresInSec) {
  write(KEY_TOKEN, {
    accessToken,
    expiresAt: Date.now() + (Number(expiresInSec) || 3600) * 1000 - 60_000, // 1分の安全マージン
  });
}

export function loadToken() {
  const t = read(KEY_TOKEN, null);
  if (!t?.accessToken) return null;
  if (Date.now() >= t.expiresAt) return null; // CON-02 テストモードでは短命
  return t;
}

export function clearToken() {
  localStorage.removeItem(KEY_TOKEN);
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
