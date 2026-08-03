// アプリ設定
// 予定の取得と書き込みは、本人の Google アカウント上に置いた Apps Script 経由で行う。
// スクリプトが本人として動くため、アプリ側での Google ログインは不要。

// FR-09 祝日カレンダーの判定に使う識別子
export const HOLIDAY_CALENDAR_MARKER = "holiday@group.v.calendar.google.com";

// FR-06 表示中の月の前後何ヶ月を先読みするか
export const PREFETCH_MONTHS = 1;

// FR-21 1マスに描くバーの最大本数。2週間表示は1マスが高いので多めに出せる。
export const MAX_BARS = 3;
export const MAX_BARS_2WEEKS = 8;

// FR-23 は「開始〜終了時刻」と「メモ」のみを規定していたが、実際に描画すると
// メモのない予定が時刻だけの行になり内容を判別できなかったため、タイトルを主役にする方針へ変更。
export const SHOW_TITLE_IN_DETAIL = true;

// FR-22 は月表示のバーに文字を載せないと定めていたが、実運用で「マスの中でも
// 内容が少し分かる方がよい」と判断したため、バーにタイトルを載せる。
// false にすると元の細い色バー（文字なし）に戻る。
export const SHOW_TITLE_IN_MONTH = true;

/* ---------- 接続先（Apps Script） ---------- */

const KEY_URL = "mycal.backendUrl";
const KEY_SECRET = "mycal.backendKey";

export function getBackend() {
  return {
    url: (localStorage.getItem(KEY_URL) || "").trim(),
    key: (localStorage.getItem(KEY_SECRET) || "").trim(),
  };
}

export function setBackend(url, key) {
  localStorage.setItem(KEY_URL, (url || "").trim());
  localStorage.setItem(KEY_SECRET, (key || "").trim());
}

export function hasBackend() {
  const { url, key } = getBackend();
  return !!url && !!key;
}
