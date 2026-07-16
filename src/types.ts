/** App Store Connect API (JSON:API) の共通レスポンス型。 */

export interface JsonApiResource<TAttributes> {
  id: string;
  type: string;
  attributes?: TAttributes;
}

export interface JsonApiLinks {
  self?: string;
  next?: string;
}

export interface JsonApiListResponse<TAttributes> {
  data: JsonApiResource<TAttributes>[];
  links?: JsonApiLinks;
}

export interface JsonApiSingleResponse<TAttributes> {
  data: JsonApiResource<TAttributes>;
}

/** リスト系ツールの共通レスポンス形式。 */
export interface ToolListResult<T> {
  count: number;
  items: T[];
  nextUrl?: string;
}
