// 色分けロジック（本アプリの中核）FR-10〜FR-17
// 判定はすべて端末内で行う。通信も再取得も伴わないため、ルール変更は即座に反映される（FR-19b）。

export const UNCLASSIFIED = { id: null, label: "未分類", color: "#6b7280" }; // FR-15

// FR-17 は4色までとしていたが、種類を必要なだけ作る方針に変更した。
// ここは上限ではなく「これを超えると凡例なしでは見分けにくい」という目安。
const MAX_COLORS = 8;

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
      `[color-rules] 色数が ${colors.size} 色あります。${MAX_COLORS} 色を超えると、凡例なしで見分けるのが難しくなります。`
    );
  }

  const rules = (ruleSet?.rules ?? [])
    // 【 】で囲んだキーワードは「本人が明示的に付けた印」とみなす
    .map((r) => ({ ...r, needle: normalize(r.keyword), explicit: /^【.+】$/.test(r.keyword.trim()) }))
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
      return { color: UNCLASSIFIED.color, label: UNCLASSIFIED.label, categoryId: null, duplicate: false, tag: null, matched: [] };
    }

    const category = byId.get(matched[0].category); // 先勝ち
    return {
      color: category.color,
      label: category.label,
      categoryId: category.id,
      // FR-16 重複ヒット印。ただし明示的な印が先頭なら、それが答えなので曖昧ではない
      duplicate: matched.length >= 2 && !matched[0].explicit,
      // 表示するときに取り除く印（色で種類が分かるため、文字としては不要）
      tag: matched[0].explicit ? matched[0].keyword : null,
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
