// アプリ設定
// CLIENT_ID はここに直接書いてもよいし、初回起動時の画面から入力してもよい（端末内にのみ保存）。

export const CLIENT_ID = "";

// FR-01 は読み取り専用スコープのみだったが、アプリから予定を追加する方針に変更したため
// 予定の書き込み権限（calendar.events）を追加している。
// カレンダー一覧の取得には readonly が必要なので、2つ並べて要求する。
export const SCOPE = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

// FR-09 祝日カレンダーの判定に使う識別子
export const HOLIDAY_CALENDAR_MARKER = "holiday@group.v.calendar.google.com";

// FR-06 表示中の月の前後何ヶ月を先読みするか
export const PREFETCH_MONTHS = 1;

// FR-21 1マスに描くバーの最大本数。2週間表示は1マスが高いので多めに出せる。
export const MAX_BARS = 3;
export const MAX_BARS_2WEEKS = 8;

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
