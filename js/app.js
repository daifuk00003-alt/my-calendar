// 自作カレンダーアプリ Phase 1
// 閲覧専用。入力・編集は Google 公式アプリで行う（3.2 対象外）。

import { MAX_BARS, PREFETCH_MONTHS, HOLIDAY_CALENDAR_MARKER, SHOW_TITLE_IN_DETAIL, SHOW_TITLE_IN_MONTH, getClientId, setClientId } from "./config.js";
import { signIn, signOut, getStoredToken } from "./auth.js";
import { listCalendars, listEvents, AuthExpiredError } from "./api.js";
import { createClassifier, loadRuleSet, UNCLASSIFIED } from "./classify.js";
import * as store from "./store.js";
import { demoEvents, demoHolidays } from "./demo.js";
import {
  startOfDay, startOfMonth, addMonths, addDays, startOfGrid,
  dateKey, isSameDay, monthLabel, detailDateLabel, timeRangeLabel, timeLabel,
} from "./dates.js";

const $ = (id) => document.getElementById(id);

const state = {
  viewMonth: startOfMonth(new Date()),
  selectedDate: startOfDay(new Date()), // FR-28 起動時は当日
  classify: null,
  calendars: [],
  events: [],                 // 取得済みの全予定（祝日を除く）
  eventsByDate: new Map(),    // dateKey -> 予定[]
  holidaysByDate: new Map(),  // dateKey -> 祝日名（FR-09）
  loadedRange: null,          // {min: Date, max: Date}
  lastUpdated: null,
  loading: false,
  demo: new URLSearchParams(location.search).has("demo"),
};

/* ============================ 起動 ============================ */

async function boot() {
  try {
    state.classify = createClassifier(await loadRuleSet());
  } catch (e) {
    console.error(e);
    showLogin("色ルールの読み込みに失敗しました。ローカルサーバー経由で開いているか確認してください。");
    return;
  }

  bindEvents();
  renderLegend();

  if (state.demo) {
    // 表示設計の検証用。認証もデータ取得も行わない。
    state.events = demoEvents();
    state.holidaysByDate = demoHolidays(dateKey);
    state.lastUpdated = new Date();
    rebuildIndex();
    showMain();
    render();
    setUpdatedLabel();
    toast("デモ表示（ダミーデータ）");
    return;
  }

  if (!getClientId()) {
    $("clientid-setup").hidden = false;
    showLogin();
    return;
  }
  if (!getStoredToken()) {
    showLogin();
    return;
  }

  showMain();
  render();
  await refresh({ initial: true });
}

/* ============================ 画面の切り替え ============================ */

function showLogin(message) {
  $("main").hidden = true;
  $("settings").hidden = true;
  $("login").hidden = false;
  if (message) {
    const el = $("login-error");
    el.textContent = message;
    el.hidden = false;
  }
}

function showMain() {
  $("login").hidden = true;
  $("settings").hidden = true;
  $("main").hidden = false;
}

/* ============================ データ取得 ============================ */

/** FR-06 表示中の月の前後1ヶ月 */
function desiredRange(viewMonth) {
  return {
    min: addMonths(viewMonth, -PREFETCH_MONTHS),
    max: addMonths(viewMonth, PREFETCH_MONTHS + 1), // 排他
  };
}

function rangeCovered(want, have) {
  return !!have && have.min <= want.min && have.max >= want.max;
}

async function refresh({ initial = false, force = false } = {}) {
  if (state.loading || state.demo) return;
  const want = desiredRange(state.viewMonth);
  if (!force && !initial && rangeCovered(want, state.loadedRange)) return;

  state.loading = true;
  setUpdatedLabel("更新中…");
  try {
    // 手動更新時もカレンダー一覧を取り直す（共有などで増えた分を拾うため）
    if (initial || force || state.calendars.length === 0) {
      state.calendars = await listCalendars();
    }

    const prefs = store.loadCalendarPrefs();
    const targets = state.calendars.filter((c) => store.isCalendarEnabled(c.id, prefs));

    const results = await Promise.all(targets.map((c) => listEvents(c.id, want.min, want.max)));

    const events = [];
    const holidays = new Map();
    targets.forEach((cal, i) => {
      const isHoliday = cal.id.includes(HOLIDAY_CALENDAR_MARKER);
      for (const ev of results[i]) {
        if (isHoliday) {
          // FR-09 祝日は予定として描画せず、日付の属性として扱う
          for (const key of spannedDateKeys(ev)) holidays.set(key, ev.title);
        } else {
          events.push(ev);
        }
      }
    });

    state.events = events;
    state.holidaysByDate = holidays;
    state.loadedRange = want;
    state.lastUpdated = new Date();
    rebuildIndex();
    render();
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      showLogin("セッションの有効期限が切れました。もう一度ログインしてください。"); // FR-07
      return;
    }
    console.error(e);
    toast(e.message || "更新に失敗しました");
  } finally {
    state.loading = false;
    setUpdatedLabel();
  }
}

/** 予定がまたがる各日（終日予定の end は排他） */
function spannedDateKeys(ev) {
  const keys = [];
  const last = ev.allDay ? addDays(ev.end, -1) : lastDayOfTimedEvent(ev);
  for (let d = startOfDay(ev.start); d <= last; d = addDays(d, 1)) keys.push(dateKey(d));
  return keys.length ? keys : [dateKey(ev.start)];
}

function lastDayOfTimedEvent(ev) {
  const end = ev.end;
  // 終了がちょうど 00:00 の場合、その日は含めない
  if (end.getHours() === 0 && end.getMinutes() === 0 && end > ev.start) return addDays(startOfDay(end), -1);
  return startOfDay(end);
}

function rebuildIndex() {
  const map = new Map();
  for (const ev of state.events) {
    ev.color = state.classify(ev.title); // FR-11 判定対象はタイトルのみ
    for (const key of spannedDateKeys(ev)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) : a.start - b.start));
  }
  state.eventsByDate = map;
}

/* ============================ 描画 ============================ */

function render() {
  renderMonth();
  renderDetail();
}

function renderMonth() {
  $("month-label").textContent = monthLabel(state.viewMonth);

  const grid = $("grid");
  grid.classList.toggle("with-text", SHOW_TITLE_IN_MONTH);
  const frag = document.createDocumentFragment();
  const first = startOfGrid(state.viewMonth);
  const today = startOfDay(new Date());

  for (let i = 0; i < 42; i++) {
    const day = addDays(first, i);
    const key = dateKey(day);
    const holiday = state.holidaysByDate.get(key);
    const events = state.eventsByDate.get(key) ?? [];

    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.date = key;
    if (day.getMonth() !== state.viewMonth.getMonth()) cell.classList.add("other-month");
    if (isSameDay(day, today)) cell.classList.add("today");
    if (isSameDay(day, state.selectedDate)) cell.classList.add("selected");

    const num = document.createElement("div");
    num.className = "daynum";
    if (holiday) num.classList.add("holiday");       // FR-09
    else if (day.getDay() === 0) num.classList.add("sun");
    else if (day.getDay() === 6) num.classList.add("sat");
    num.textContent = day.getDate();
    cell.appendChild(num);

    const bars = document.createElement("div");
    bars.className = "bars";
    events.slice(0, MAX_BARS).forEach((ev) => {          // FR-21 最大3本
      const bar = document.createElement("div");
      bar.className = ev.allDay ? "bar allday" : "bar";  // OPEN-04 暫定
      bar.style.background = ev.color.color;
      if (SHOW_TITLE_IN_MONTH) bar.textContent = ev.title;
      bars.appendChild(bar);
    });
    if (events.length > MAX_BARS) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${events.length - MAX_BARS}`;  // FR-21 超過分
      bars.appendChild(more);
    }
    cell.appendChild(bars);
    frag.appendChild(cell);
  }

  grid.replaceChildren(frag);
}

function renderDetail() {
  const key = dateKey(state.selectedDate);
  $("detail-date").textContent = detailDateLabel(state.selectedDate);
  $("detail-holiday").textContent = state.holidaysByDate.get(key) ?? "";

  const list = $("detail-list");
  const events = state.eventsByDate.get(key) ?? [];

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "予定はありません";
    list.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const ev of events) {
    const row = document.createElement("div");
    row.className = "ev";

    const chip = document.createElement("div");
    chip.className = "ev-chip";
    chip.style.background = ev.color.color;
    row.appendChild(chip);

    const main = document.createElement("div");
    main.className = "ev-main";

    const time = document.createElement("div");
    time.className = "ev-time";
    time.textContent = timeRangeLabel(ev, state.selectedDate); // FR-23
    if (ev.color.duplicate) {                                   // FR-16 重複ヒット印
      const mark = document.createElement("span");
      mark.className = "dup-mark";
      mark.textContent = "●";
      mark.title = `複数のルールに一致: ${ev.color.matched.join(" / ")}`;
      time.appendChild(mark);
    }
    main.appendChild(time);

    if (SHOW_TITLE_IN_DETAIL) {
      const title = document.createElement("div");
      title.className = "ev-title";
      title.textContent = ev.title;
      main.appendChild(title);
    }

    if (ev.description) {
      const note = document.createElement("div");
      note.className = "ev-note";
      note.textContent = ev.description;                        // FR-23 メモ・説明文
      note.addEventListener("click", (e) => {                   // FR-24 タップで全文展開
        e.stopPropagation();
        openSheet(ev);
      });
      main.appendChild(note);
    }

    row.appendChild(main);
    row.addEventListener("click", () => openInGoogle(ev));      // FR-26
    frag.appendChild(row);
  }
  list.replaceChildren(frag);
  // ブラウザが再読み込み時にスクロール位置を復元してくるため、次フレームでも先頭に戻す
  list.scrollTop = 0;
  requestAnimationFrame(() => (list.scrollTop = 0));
}

function renderLegend() {
  const legend = $("legend");
  const rows = [...state.classify.categories, UNCLASSIFIED].map((cat) => {
    const row = document.createElement("div");
    row.className = "legend-row";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = cat.color;
    const label = document.createElement("span");
    label.textContent = cat.label;
    const kw = document.createElement("span");
    kw.className = "legend-kw";
    kw.textContent = state.classify.rules
      .filter((r) => r.category === cat.id)
      .map((r) => r.keyword)
      .join("、");
    row.append(sw, label, kw);
    return row;
  });
  legend.replaceChildren(...rows);
}

function setUpdatedLabel(text) {
  $("updated-at").textContent = text ?? (state.lastUpdated ? `最終更新 ${timeLabel(state.lastUpdated)}` : "");
}

/* ============================ 操作 ============================ */

function goMonth(delta) {
  state.viewMonth = addMonths(state.viewMonth, delta);
  // 先読み済みの範囲から即座に描画する（NFR-03）
  render();
  refresh(); // 範囲が足りなければ裏で取得
}

function selectDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  state.selectedDate = new Date(y, m - 1, d);
  if (state.selectedDate.getMonth() !== state.viewMonth.getMonth() ||
      state.selectedDate.getFullYear() !== state.viewMonth.getFullYear()) {
    state.viewMonth = startOfMonth(state.selectedDate);
    refresh();
  }
  render();
}

function openInGoogle(ev) {
  if (!ev.htmlLink) return;
  window.open(ev.htmlLink, "_blank", "noopener");
}

function openSheet(ev) {
  $("sheet-time").textContent = timeRangeLabel(ev, state.selectedDate);
  $("sheet-title").textContent = ev.title;
  $("sheet-note").textContent = ev.description;
  $("sheet").hidden = false;
}

function closeSheet() {
  $("sheet").hidden = true;
}

let toastTimer = null;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

/* ============================ 設定画面（FR-08） ============================ */

function openSettings() {
  const prefs = store.loadCalendarPrefs();
  const rows = state.calendars.map((cal) => {
    const row = document.createElement("label");
    row.className = "cal-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = store.isCalendarEnabled(cal.id, prefs);
    cb.addEventListener("change", () => {
      store.setCalendarEnabled(cal.id, cb.checked);
      refresh({ force: true });
    });

    const name = document.createElement("span");
    name.className = "cal-name";
    name.textContent = cal.name;

    row.append(cb, name);
    if (cal.id.includes(HOLIDAY_CALENDAR_MARKER)) {
      const tag = document.createElement("span");
      tag.className = "cal-tag";
      tag.textContent = "祝日（日付を赤くする）";
      row.appendChild(tag);
    }
    return row;
  });

  $("calendar-list").replaceChildren(...rows);
  $("main").hidden = true;
  $("settings").hidden = false;
}

/* ============================ イベント登録 ============================ */

function bindEvents() {
  $("btn-prev").addEventListener("click", () => goMonth(-1));
  $("btn-next").addEventListener("click", () => goMonth(1));
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-settings-close").addEventListener("click", showMain);

  $("btn-logout").addEventListener("click", () => {
    signOut();
    location.reload();
  });

  $("grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (cell) selectDate(cell.dataset.date);
  });

  $("sheet").addEventListener("click", (e) => {
    if (e.target.dataset.close) closeSheet();
  });

  $("btn-login").addEventListener("click", onLogin);

  // FR-03 バックグラウンドから復帰した時
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !$("main").hidden) {
      refresh({ force: true });
    }
  });

  bindGestures();
}

async function onLogin() {
  const btn = $("btn-login");
  const err = $("login-error");
  err.hidden = true;

  if (!$("clientid-setup").hidden) {
    const value = $("clientid-input").value.trim();
    if (!value) {
      err.textContent = "クライアント ID を入力してください。";
      err.hidden = false;
      return;
    }
    setClientId(value);
  }

  btn.disabled = true;
  try {
    await signIn();
    showMain();
    render();
    await refresh({ initial: true });
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/** FR-27 左右スワイプで前月・翌月 ／ FR-04 引っ張って更新 */
function bindGestures() {
  const pane = $("month-pane");
  const indicator = $("pull-indicator");
  const SWIPE = 50;
  const PULL = 70;
  let x0 = 0, y0 = 0, axis = null, pulling = false;

  pane.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    axis = null;
    pulling = false;
  }, { passive: true });

  pane.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (!axis && Math.abs(dx) + Math.abs(dy) > 12) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (axis === "y" && dy > 0) {
      pulling = dy > PULL;
      indicator.classList.add("visible");
      $("pull-text").textContent = pulling ? "指を離して更新" : "引っ張って更新";
    }
  }, { passive: true });

  pane.addEventListener("touchend", (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? x0) - x0;
    indicator.classList.remove("visible");
    if (axis === "x" && Math.abs(dx) > SWIPE) {
      goMonth(dx < 0 ? 1 : -1);
    } else if (pulling) {
      refresh({ force: true });
    }
    axis = null;
    pulling = false;
  }, { passive: true });
}

/* ============================ Service Worker ============================ */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW 登録に失敗", e));
  });
}

boot();
