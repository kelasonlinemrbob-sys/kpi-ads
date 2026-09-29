/** Normalises a product code for matching: trimmed and upper-cased. */
export function normalizeKeyword(keyword: string) {
  return keyword.trim().toUpperCase();
}

/**
 * Finds the product whose code appears in a platform campaign name (case-insensitive).
 * When several codes match, the longest one wins, so "SERUM-VIT" beats "SERUM".
 */
export function matchProduct<T extends { keyword: string }>(campaignName: string, products: T[]): T | null {
  const name = campaignName.toUpperCase();
  let best: T | null = null;
  for (const product of products) {
    const keyword = normalizeKeyword(product.keyword);
    if (keyword && name.includes(keyword) && (!best || keyword.length > normalizeKeyword(best.keyword).length)) {
      best = product;
    }
  }
  return best;
}
