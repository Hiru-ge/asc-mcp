/** list系ツール共通のページネーション・整形ロジック。 */
import { getJson } from "../client.js";
import type { JsonApiListResponse, JsonApiResource, ToolListResult } from "../types.js";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 200;

/**
 * limit/offsetではなくURLベースのページネーションを採用するASCの流儀に合わせ、
 * nextUrlが渡された場合はそれをそのまま叩き、なければ basePath + query を組み立てる。
 */
export function buildListPath(
  basePath: string,
  query: Record<string, string | number | undefined>,
  nextUrl?: string
): string {
  if (nextUrl) {
    return nextUrl;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/** JSON:APIのリストレスポンスをattributesだけの簡潔な配列に平坦化する。 */
export async function fetchAndFlattenList<TAttributes, TItem>(
  path: string,
  mapItem: (resource: JsonApiResource<TAttributes>) => TItem
): Promise<ToolListResult<TItem>> {
  const response = await getJson<JsonApiListResponse<TAttributes>>(path);
  const items = response.data.map(mapItem);
  return {
    count: items.length,
    items,
    nextUrl: response.links?.next,
  };
}
