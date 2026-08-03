// FR-02 Google Calendar API（読み取り専用）

import { getStoredToken, invalidateToken } from "./auth.js";

const BASE = "https://www.googleapis.com/calendar/v3";

export class AuthExpiredError extends Error {
  constructor() {
    super("認証の有効期限が切れました。");
    this.name = "AuthExpiredError";
  }
}

export class WritePermissionError extends Error {
  constructor() {
    super("予定を追加する権限がありません。設定画面からログアウトし、もう一度ログインしてください。");
    this.name = "WritePermissionError";
  }
}

async function call(path, params = {}, init = null) {
  const token = getStoredToken();
  if (!token) throw new AuthExpiredError(); // FR-07

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const options = { headers: { Authorization: `Bearer ${token}` } };
  if (init) {
    options.method = init.method;
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(init.body);
  }

  const res = await fetch(url, options);

  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    if (res.status === 401 || /invalid.?credential|authError/i.test(body)) {
      invalidateToken();
      throw new AuthExpiredError(); // FR-07
    }
    // スコープ不足（読み取り権限しか持っていない状態で書き込んだ場合）
    if (/insufficient|ACCESS_TOKEN_SCOPE|forbiddenForServiceAccount|Request had insufficient/i.test(body)) {
      throw new WritePermissionError();
    }
    throw new Error(`API エラー (${res.status})`);
  }
  if (res.status === 429) throw new Error("アクセス回数の上限に達しました。しばらく待って再試行してください。"); // CON-03
  if (!res.ok) throw new Error(`API エラー (${res.status})`);

  return res.json();
}

/** カレンダー一覧（FR-08 の設定対象、FR-09 の祝日判定に使う） */
export async function listCalendars() {
  const out = [];
  let pageToken;
  do {
    const data = await call("/users/me/calendarList", { maxResults: 250, pageToken, minAccessRole: "reader" });
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out.map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    primary: !!c.primary,
    selectedInGoogle: c.selected !== false,
    // owner / writer なら予定を追加できる
    writable: c.accessRole === "owner" || c.accessRole === "writer",
  }));
}

/**
 * 予定を追加する。
 * @param {string} calendarId
 * @param {{title:string, description:string, allDay:boolean, date:string, startTime?:string, endTime?:string}} input
 */
export async function createEvent(calendarId, input) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body = {
    summary: input.title,
    description: input.description || undefined,
  };

  if (input.allDay) {
    body.start = { date: input.date };
    body.end = { date: nextDay(input.date) }; // 終日予定の終了日は排他
  } else {
    body.start = { dateTime: `${input.date}T${input.startTime}:00`, timeZone };
    body.end = { dateTime: `${input.date}T${input.endTime}:00`, timeZone };
  }

  const data = await call(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {},
    { method: "POST", body }
  );
  return normalizeEvent(data, calendarId);
}

function nextDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-${dd}`;
}

/**
 * 指定期間の予定（FR-06 の範囲取得）。
 * 繰り返し予定は singleEvents で個別の予定に展開する。
 */
export async function listEvents(calendarId, timeMin, timeMax) {
  const out = [];
  let pageToken;
  do {
    const data = await call(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      showDeleted: false,
      fields:
        "nextPageToken,items(id,summary,description,location,start,end,htmlLink,status)",
      pageToken,
    });
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return out
    .filter((e) => e.status !== "cancelled")
    .map((e) => normalizeEvent(e, calendarId));
}

/** API のレスポンスを、6章のデータ要件に沿った形へ整える */
function normalizeEvent(e, calendarId) {
  const allDay = !!e.start?.date;
  return {
    id: e.id,
    calendarId,
    title: e.summary || "(タイトルなし)",
    description: e.description || "",
    location: e.location || "", // 取得するが表示しない（OPEN-01）
    allDay,
    start: allDay ? parseDateOnly(e.start.date) : new Date(e.start.dateTime),
    // 終日予定の end.date は翌日（排他）
    end: allDay ? parseDateOnly(e.end.date) : new Date(e.end.dateTime),
    htmlLink: e.htmlLink || "", // FR-26 Google 公式アプリへの導線
  };
}

function parseDateOnly(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
