import type { JsonApiResource, JsonApiSingleResponse } from "../types.js";

export type ToolResponse =
  | { content: Array<{ type: "text"; text: string }> }
  | { isError: true; content: Array<{ type: "text"; text: string }> };

export function textResult(value: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function resourceResult<T>(response: JsonApiSingleResponse<T> | undefined): ToolResponse {
  return textResult(response?.data ?? { success: true });
}

export function pickDefined<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function requireAttributes(attributes: Record<string, unknown>): void {
  if (Object.keys(attributes).length === 0) {
    throw new Error("更新するフィールドを1つ以上指定してください。");
  }
}

export function flattenResource(resource: JsonApiResource<unknown>): Record<string, unknown> {
  const attributes = resource.attributes;
  return {
    id: resource.id,
    ...(attributes && typeof attributes === "object" ? attributes : {}),
  };
}
