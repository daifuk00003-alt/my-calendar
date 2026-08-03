// アプリ設定
// CLIENT_ID はここに直接書いてもよいし、初回起動時の画面から入力してもよい（端末内にのみ保存）。

export const CLIENT_ID = "";

// FR-01 読み取り専用スコープ（PRE-04 / NFR-06）
export const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

// FR-09 祝日カレンダーの判定に使う識別子
export const HOLIDAY_CALENDAR_MARKER = "holiday@group.v.calendar.google.com";

// FR-06 表示中の月の前後何ヶ月を先読みするか
export const PREFETCH_MONTHS = 1;

// FR-21 月表示の1マスに描くバーの最大本数（Phase 1 の検証で見直す対象）
export const MAX_BARS = 3;

// FR-22 は月表示のバーに文字を載せないと定めていたが、実運用で「マスの中でも
// 内容が少し分かる方がよい」と判断したため、バーにタイトルを載せる。
// false にすると元の細い色バー（文字なし）に戻る。
export const SHOW_TITLE_IN_MONTH = true;

// FR-23 は「開始〜終了時刻」と「メモ」のみを規定していたが、実際に描画すると
// メモのない予定が時刻だけの行になり内容を判別できなかったため、タイトルを主役にする方針へ変更。
export const SHOW_TITLE_IN_DETAIL = true;

const CLIENT_ID_KEY = "mycal.clientId";

export function getClientId() {
  return (CLIENT_ID || localStorage.getItem(CLIENT_ID_KEY) || "").trim();
}

export function setClientId(id) {
  localStorage.setItem(CLIENT_ID_KEY, (id || "").trim());
}
