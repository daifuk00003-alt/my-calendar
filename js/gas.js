// Apps Script（本人のGoogleアカウント上で動く裏方）との通信。
// スクリプトが本人として動くため、アプリ側では Google ログインを一切行わない。

import { getBackend } from "./config.js";

export class NotConfiguredError extends Error {
  constructor() {
    super("接続先が設定されていません。");
    this.name = "NotConfiguredError";
  }
}

async function call(params) {
  const { url, key } = getBackend();
  if (!url || !key) throw new NotConfiguredError();

  const target = new URL(url);
  target.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) target.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await fetch(target, { redirect: "follow" });
  } catch {
    throw new Error("通信できませんでした。電波の状態を確認してください。");
  }
  if (!res.ok) throw new Error(`通信に失敗しました (${res.status})`);

  const text = await res.text();
  if (text.startsWith("<")) {
    // ログイン画面が返ってきた＝「アクセスできるユーザー」が全員になっていない
    throw new Error("接続先の公開設定を確認してください（アクセスできるユーザー＝全員）。");
  }

  const data = JSON.parse(text);
  if (data.error) throw new Error(data.error);
  return data;
}

/** 設定した接続先が生きているか確かめる */
export async function ping() {
  return call({ action: "ping" });
}

export async function listCalendars() {
  const data = await call({ action: "calendars" });
  return data.calendars ?? [];
}

export async function listEvents(calendarIds, timeMin, timeMax) {
  const data = await call({
    action: "events",
    calendars: calendarIds.join(","),
    from: timeMin.toISOString(),
    to: timeMax.toISOString(),
  });
  return (data.events ?? []).map(reviveEvent);
}

export async function createEvent(calendarId, input) {
  const { start, end } = toRange(input);
  await call({
    action: "create",
    calendar: calendarId,
    title: input.title,
    allday: input.allDay ? "1" : "0",
    start: start.toISOString(),
    end: end.toISOString(),
  });
}

export async function updateEvent(calendarId, eventId, input) {
  const params = {
    action: "update",
    calendar: calendarId,
    id: eventId,
    title: input.title,
  };
  if (input.date) {
    const { start, end } = toRange(input);
    params.allday = input.allDay ? "1" : "0";
    params.start = start.toISOString();
    params.end = end.toISOString();
  } else {
    params.keepTimes = "1"; // 日をまたぐ予定は名前だけ変える
  }
  await call(params);
}

export async function deleteEvent(calendarId, eventId) {
  await call({ action: "delete", calendar: calendarId, id: eventId });
}

/* ---------- 変換 ---------- */

function toRange(input) {
  const [y, m, d] = input.date.split("-").map(Number);
  if (input.allDay) {
    const start = new Date(y, m - 1, d);
    return { start, end: new Date(y, m - 1, d + 1) };
  }
  const [sh, sm] = input.startTime.split(":").map(Number);
  const [eh, em] = input.endTime.split(":").map(Number);
  return { start: new Date(y, m - 1, d, sh, sm), end: new Date(y, m - 1, d, eh, em) };
}

function reviveEvent(e) {
  return {
    ...e,
    title: e.title || "(タイトルなし)",
    start: new Date(e.start),
    end: new Date(e.end),
  };
}
