// 日付ユーティリティ（すべて端末のローカルタイムゾーンで扱う）

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 月表示グリッドの左上（その月の1日を含む週の日曜） */
export function startOfGrid(monthStart) {
  return addDays(monthStart, -monthStart.getDay());
}

export function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function monthLabel(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function detailDateLabel(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
}

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** FR-23 「開始〜終了時刻」 */
export function timeRangeLabel(ev, onDate) {
  if (ev.allDay) return "終日";
  const sameStart = isSameDay(ev.start, ev.end);
  if (sameStart) return `${hhmm(ev.start)} - ${hhmm(ev.end)}`;
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md(ev.start)} ${hhmm(ev.start)} - ${md(ev.end)} ${hhmm(ev.end)}`;
}

export function timeLabel(d) {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hhmm(d)}`;
}
