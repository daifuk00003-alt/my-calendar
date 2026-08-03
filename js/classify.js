// 色分けロジック（本アプリの中核）FR-10〜FR-17
// 判定はすべて端末内で行う。通信も再取得も伴わないため、ルール変更は即座に反映される（FR-19b）。

export const UNCLASSIFIED = { id: null, label: "未分類", color: "#9aa0a6" }; // FR-15

const MAX_COLORS = 4; // FR-17

/** FR-13 全角/半角・英大文字/小文字を同一視する正規化 */
export function normalize(s) {
  return (s || "").normalize("NFKC").toLowerCase().trim();
}

/**
 * ルールセットから判定関数を作る。
 * @param {{categories: Array, rules: Array}} ruleSet
 */
export function createClassifier(ruleSet) {
  const categories = ruleSet?.categories ?? [];
  const byId = new Map(categories.map((c) => [c.id, c]));

  const colors = new Set(categories.map((c) => c.color));
  if (colors.size > MAX_COLORS) {
    console.warn(
      `[color-rules] 色数が ${colors.size} 色です。FR-17 の上限は ${MAX_COLORS} 色＋未分類グレーです。`
    );
  }

  const rules = (ruleSet?.rules ?? [])
    .map((r) => ({ ...r, needle: normalize(r.keyword) }))
    .filter((r) => {
      if (!r.needle) return false;
      if (!byId.has(r.category)) {
        console.warn(`[color-rules] 未定義のカテゴリ "${r.category}"（キーワード: ${r.keyword}）`);
        return false;
      }
      return true;
    });

  /**
   * @param {string} title 予定タイトル（FR-11 判定に使うのはタイトルのみ）
   * @returns {{color:string, label:string, categoryId:(string|null), duplicate:boolean, matched:string[]}}
   */
  function classify(title) {
    const haystack = normalize(title);
    const matched = [];

    for (const rule of rules) {            // FR-14 上から順に評価
      if (haystack.includes(rule.needle)) { // FR-12 部分一致
        matched.push(rule);
      }
    }

    if (matched.length === 0) {            // FR-15 未分類はグレー
      return { color: UNCLASSIFIED.color, label: UNCLASSIFIED.label, categoryId: null, duplicate: false, matched: [] };
    }

    const category = byId.get(matched[0].category); // 先勝ち
    return {
      color: category.color,
      label: category.label,
      categoryId: category.id,
      duplicate: matched.length >= 2,      // FR-16 重複ヒット印
      matched: matched.map((r) => r.keyword),
    };
  }

  classify.categories = categories;
  classify.rules = rules;
  return classify;
}

/** ルールファイルの読み込み（FR-19c：Phase 1 では JSON に固定記述） */
export async function loadRuleSet(url = "js/color-rules.json") {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`色ルールを読み込めませんでした (${res.status})`);
  return res.json();
}
