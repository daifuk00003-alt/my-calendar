// 表示設計の検証用ダミーデータ（?demo=1 で起動したときのみ使用）
// Google 認証を設定する前に、バー本数・色数・上下の分割比率を確認するためのもの。

function at(dayOffset, h, m, durMin, title, description = "") {
  const base = new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m);
  const end = new Date(start.getTime() + durMin * 60_000);
  return {
    id: `demo-${dayOffset}-${h}${m}-${title}`,
    calendarId: "demo",
    title,
    description,
    location: "",
    allDay: false,
    start,
    end,
    htmlLink: "",
  };
}

function allDay(dayOffset, days, title, description = "") {
  const base = new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset + days);
  return {
    id: `demo-allday-${dayOffset}-${title}`,
    calendarId: "demo",
    title,
    description,
    location: "",
    allDay: true,
    start,
    end,
    htmlLink: "",
  };
}

export function demoEvents() {
  return [
    at(0, 10, 0, 60, "定例会議", "先週の進捗と今週の予定を共有する。資料は前日までに共有ドライブへ。議事メモは会議後にこのスペースへ追記していく方針。"),
    at(0, 15, 0, 90, "採用面接の打合せ", "評価軸のすり合わせ。重複ヒットの確認用（面接 と 打合せ の両方に一致）。"),
    at(0, 19, 30, 120, "英語の勉強", ""),
    at(0, 21, 0, 60, "散歩", "どのルールにも一致しない予定（未分類グレーの確認用）"),
    at(1, 9, 0, 30, "朝会 MTG", "短い立ち話"),
    at(1, 13, 0, 60, "通院の付き添い", ""),
    at(2, 11, 0, 60, "講義の準備", "スライドの見直し"),
    at(2, 18, 0, 180, "飲み会", ""),
    allDay(3, 1, "実家に帰省", ""),
    at(4, 14, 0, 60, "映画", ""),
    at(5, 10, 0, 45, "打合せ", ""),
    at(5, 12, 0, 60, "ランチ", ""),
    at(5, 14, 0, 60, "会議", ""),
    at(5, 16, 0, 60, "試験対策", ""),
    at(5, 18, 0, 60, "買い物", ""),
    allDay(8, 3, "旅行", "金曜の夜に出発"),
    at(-2, 10, 0, 60, "会議", "先週分"),
  ];
}

export function demoHolidays(dateKeyOf) {
  const base = new Date();
  const holiday = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 6);
  return new Map([[dateKeyOf(holiday), "デモ祝日"]]);
}
