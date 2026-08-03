// 色の明るさから、読める文字色を決めるための小さなユーティリティ。
// 黄色や水色のような明るい色に白文字を載せると読めないため、自動で切り替える。

function parseHex(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** 相対輝度（0=黒, 1=白） */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const hi = Math.max(a, b) + 0.05;
  const lo = Math.min(a, b) + 0.05;
  return hi / lo;
}

const DARK_TEXT = "#1a1d21";

/** その色を背景にしたとき、読める文字色（白か黒か） */
export function textOn(hex) {
  const l = luminance(hex);
  return contrast(l, 1) >= contrast(l, 0) ? "#ffffff" : DARK_TEXT;
}

/** 白背景に文字として置いても読める濃さまで暗くした色 */
export function readableOnWhite(hex, minContrast = 4.5) {
  let rgb = parseHex(hex);
  for (let i = 0; i < 14; i++) {
    if (contrast(luminance(toHex(rgb)), 1) >= minContrast) break;
    rgb = rgb.map((c) => c * 0.85);
  }
  return toHex(rgb);
}
