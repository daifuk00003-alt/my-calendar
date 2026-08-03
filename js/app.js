// 自作カレンダーアプリ Phase 1
// 閲覧専用。入力・編集は Google 公式アプリで行う（3.2 対象外）。

import { MAX_BARS, PREFETCH_MONTHS, HOLIDAY_CALENDAR_MARKER, SHOW_TITLE_IN_DETAIL, SHOW_TITLE_IN_MONTH, getClientId, setClientId } from "./config.js";
import { signIn, signOut, getStoredToken } from "./auth.js";
import { listCalendars, listEvents, createEvent, deleteEvent, AuthExpiredError } from "./api.js";
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

  // その月が占める週数だけ描く（4〜6週）。余った行を作らないぶん1マスを高くできる。
  const daysInMonth = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((state.viewMonth.getDay() + daysInMonth) / 7);
  grid.style.setProperty("--rows", weeks);

  for (let i = 0; i < weeks * 7; i++) {
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

    // 左スワイプで削除ボタンを出す
    const wrap = document.createElement("div");
    wrap.className = "ev-wrap";

    const actions = document.createElement("div");
    actions.className = "ev-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ev-delete";
    del.textContent = "削除";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDelete(ev);
    });
    actions.appendChild(del);

    row.addEventListener("click", () => {
      if (wrap.dataset.swiped === "1") {  // スワイプ操作の直後は開かない
        closeSwipe();
        return;
      }
      openInGoogle(ev);                                          // FR-26
    });

    wrap.append(actions, row);
    attachSwipe(wrap, row);
    frag.appendChild(wrap);
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

/* ============================ 予定の削除（左スワイプ） ============================ */

const SWIPE_OPEN_X = -88; // 削除ボタンの幅
let openedSwipe = null;   // いま開いている行

function setSwipe(wrap, row, open) {
  if (open) {
    if (openedSwipe && openedSwipe.wrap !== wrap) closeSwipe();
    openedSwipe = { wrap, row };
    wrap.classList.add("open");
    row.style.transform = `translateX(${SWIPE_OPEN_X}px)`;
  } else {
    if (openedSwipe && openedSwipe.wrap === wrap) openedSwipe = null;
    wrap.classList.remove("open");
    row.style.transform = "";
  }
}

function closeSwipe() {
  if (!openedSwipe) return;
  const { wrap, row } = openedSwipe;
  openedSwipe = null;
  wrap.classList.remove("open");
  row.style.transform = "";
}

function attachSwipe(wrap, row) {
  let startX = 0, dx = 0, active = false, captured = false;

  row.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = e.clientX;
    dx = 0;
    active = true;
    captured = false;
    wrap.dataset.swiped = "0";
    row.style.transition = "none";
  });

  row.addEventListener("pointermove", (e) => {
    if (!active) return;
    dx = e.clientX - startX;
    if (!captured && Math.abs(dx) > 8) {
      captured = true;
      wrap.dataset.swiped = "1";
      try { row.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
    }
    if (!captured) return;
    const base = wrap.classList.contains("open") ? SWIPE_OPEN_X : 0;
    row.style.transform = `translateX(${Math.min(0, Math.max(SWIPE_OPEN_X - 16, base + dx))}px)`;
  });

  const finish = () => {
    if (!active) return;
    active = false;
    row.style.transition = "";
    if (!captured) return;
    const base = wrap.classList.contains("open") ? SWIPE_OPEN_X : 0;
    setSwipe(wrap, row, base + dx < SWIPE_OPEN_X / 2);
    // クリック判定が終わってからフラグを戻す
    setTimeout(() => (wrap.dataset.swiped = "0"), 0);
  };

  row.addEventListener("pointerup", finish);
  row.addEventListener("pointercancel", finish);
}

async function confirmDelete(ev) {
  const label = ev.title || "この予定";
  if (!window.confirm(`「${label}」を削除します。よろしいですか？\n（Google カレンダーのゴミ箱に移動します）`)) return;

  closeSwipe();

  if (state.demo) {
    toast("デモ表示のため削除しません");
    return;
  }

  try {
    await deleteEvent(ev.calendarId, ev.id);
    state.events = state.events.filter((x) => !(x.id === ev.id && x.calendarId === ev.calendarId));
    rebuildIndex();
    render();
    toast("予定を削除しました");
    refresh({ force: true });
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      showLogin("セッションの有効期限が切れました。もう一度ログインしてください。");
      return;
    }
    toast(e.message || "削除に失敗しました");
  }
}

/* ============================ 予定の追加 ============================ */

const DURATIONS = [
  { minutes: 30, label: "30分" },
  { minutes: 60, label: "1時間" },
  { minutes: 90, label: "1時間半" },
  { minutes: 120, label: "2時間" },
  { minutes: 180, label: "3時間" },
];

let composeCategory = null; // null は「自動」（キーワード判定にまかせる）
let composeDuration = 60;

/** 予定を追加するカレンダー。書き込めるものを優先し、なければメイン。 */
function targetCalendarId() {
  const writable = state.calendars.filter((c) => c.writable);
  const pick = writable.find((c) => c.primary) ?? writable[0] ?? state.calendars.find((c) => c.primary);
  return pick?.id ?? "primary";
}

/** 選択中の日を初期値にしてフォームを開く */
function openCompose() {
  const form = $("compose-form");
  form.reset();
  $("compose-error").hidden = true;

  // 日付は月表示で選んでいる日。入力欄は置かず、見出しで示す。
  $("compose-title").textContent = `${detailDateLabel(state.selectedDate)} に追加`;

  // 開始時刻は「次のキリのよい時刻」
  const now = new Date();
  const start = new Date(state.selectedDate);
  start.setHours(isSameDay(state.selectedDate, now) ? now.getHours() + 1 : 10, 0, 0, 0);
  $("c-start").value = hhmm(start);

  composeCategory = null;
  composeDuration = 60;
  renderComposeChips();

  syncAllDay();
  $("compose").hidden = false;
  // preventScroll を付けないと、フォーム上部（見出し）が隠れる位置までスクロールしてしまう
  $("c-title").focus({ preventScroll: true });
  $("compose-form").scrollTop = 0;
}

function renderComposeChips() {
  // 種類（色）。既定では何も選ばれておらず、選ばないと追加できない。
  const colorChips = state.classify.categories.map((cat) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = cat.label;
    const selected = composeCategory === cat.id;
    if (selected) chip.classList.add("selected");
    chip.style.borderColor = cat.color;
    chip.style.color = selected ? "#fff" : cat.color;
    chip.style.background = selected ? cat.color : "none";
    chip.addEventListener("click", () => {
      composeCategory = cat.id;
      renderComposeChips();
    });
    return chip;
  });
  $("c-colors").replaceChildren(...colorChips);

  // 長さ
  const durationChips = DURATIONS.map((d) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip plain" + (composeDuration === d.minutes ? " selected" : "");
    chip.textContent = d.label;
    chip.addEventListener("click", () => {
      composeDuration = d.minutes;
      renderComposeChips();
    });
    return chip;
  });
  $("c-durations").replaceChildren(...durationChips);

  updateEndLabel();
}

function updateEndLabel() {
  const end = computeEndTime();
  $("c-endlabel").textContent = end ? `→ ${end} に終わる` : "";
}

/** 開始時刻 + 長さ から終了時刻を出す（日をまたぐ場合は 23:59 で止める） */
function computeEndTime() {
  const value = $("c-start").value;
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const total = h * 60 + m + composeDuration;
  if (total >= 24 * 60) return "23:59";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function closeCompose() {
  $("compose").hidden = true;
}

function syncAllDay() {
  $("c-times").hidden = $("c-allday").checked;
}

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function submitCompose(e) {
  e.preventDefault();
  const err = $("compose-error");
  const submit = $("c-submit");
  err.hidden = true;

  const input = {
    title: composeTitle(),
    description: $("c-note").value.trim(),
    allDay: $("c-allday").checked,
    date: dateKey(state.selectedDate),
    startTime: $("c-start").value,
    endTime: computeEndTime(),
  };

  if (!composeCategory) return showComposeError("種類（色）を選んでください。");
  if (!$("c-title").value.trim()) return showComposeError("予定名を入力してください。");
  if (!input.allDay) {
    if (!input.startTime) return showComposeError("開始時刻を入力してください。");
    if (input.endTime <= input.startTime) return showComposeError("開始が遅すぎます。時刻を見直してください。");
  }

  if (state.demo) {
    closeCompose();
    toast("デモ表示のため保存しません");
    return;
  }

  submit.disabled = true;
  submit.textContent = "追加中…";
  try {
    await createEvent(targetCalendarId(), input);
    closeCompose();
    // 選択日を追加した日に合わせてから取り直す
    selectDate(input.date);
    await refresh({ force: true });
    toast("予定を追加しました");
  } catch (e2) {
    if (e2 instanceof AuthExpiredError) {
      closeCompose();
      showLogin("セッションの有効期限が切れました。もう一度ログインしてください。");
      return;
    }
    showComposeError(e2.message || "追加に失敗しました。");
  } finally {
    submit.disabled = false;
    submit.textContent = "追加";
  }
}

/**
 * 選んだ種類を予定名の先頭に【 】として付ける。
 * 色の判定はタイトルで行うため（FR-11）、色を残すには予定名に印が要る。
 * 「自動」を選んだ場合や、すでに同じ印が付いている場合は何もしない。
 */
function composeTitle() {
  const title = $("c-title").value.trim();
  if (!composeCategory) return title;
  const category = state.classify.categories.find((c) => c.id === composeCategory);
  if (!category) return title;
  const tag = `【${category.label}】`;
  return title.startsWith(tag) ? title : tag + title;
}

function showComposeError(message) {
  const err = $("compose-error");
  err.textContent = message;
  err.hidden = false;
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

  $("btn-add").addEventListener("click", openCompose);
  $("compose").addEventListener("click", (e) => {
    if (e.target.dataset.composeClose) closeCompose();
  });
  $("c-allday").addEventListener("change", syncAllDay);
  $("c-start").addEventListener("input", updateEndLabel);
  $("compose-form").addEventListener("submit", submitCompose);

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
