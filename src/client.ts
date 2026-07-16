/**
 * App Store Connect API のHTTPクライアント。
 * 通常のJSON:APIレスポンスを返すGET/POSTと、gzip圧縮されたTSVレポートを返すGETの2種のヘルパーを提供する。
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { getAccessToken, MissingEnvVarsError } from "./auth.js";

const API_BASE_URL = "https://api.appstoreconnect.apple.com";

/** 外部リクエスト共通のタイムアウト(ミリ秒)。相手が応答を返さない場合にツール呼び出しが無応答で待ち続けないようにする。 */
export const REQUEST_TIMEOUT_MS = 30_000;

/** gunzip展開後の最大サイズ(バイト)。相手が想定外に巨大なデータを返した場合の防御。 */
export const GUNZIP_MAX_OUTPUT_LENGTH = 100 * 1024 * 1024;

interface AscApiError {
  code?: string;
  title?: string;
  detail?: string;
}

interface AscErrorBody {
  errors?: AscApiError[];
}

export class AscApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: AscApiError[]
  ) {
    super(message);
    this.name = "AscApiRequestError";
  }
}

/** 非2xxレスポンスをASCの errors 配列を使って読みやすいエラーメッセージに整形し、投げる。 */
async function throwForErrorResponse(response: Response): Promise<never> {
  let body: AscErrorBody = {};
  try {
    body = (await response.json()) as AscErrorBody;
  } catch {
    // レスポンスボディがJSONでない場合は無視してステータスのみで組み立てる
  }

  const errors = body.errors ?? [];
  const detail = errors
    .map((e) => [e.code, e.title, e.detail].filter(Boolean).join(": "))
    .join(" / ");

  let hint = "";
  if (response.status === 401) {
    hint = " ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY_PATH が正しいか確認してください。";
  } else if (response.status === 429) {
    hint = " レート制限に達しています。時間をおいて再試行してください。";
  }

  const message = `App Store Connect APIエラー (HTTP ${response.status})${detail ? `: ${detail}` : ""}.${hint}`;
  throw new AscApiRequestError(message, response.status, errors);
}

/** fetchのタイムアウトによる失敗を、原因が分かるエラーメッセージに変換して投げ直す。 */
function rethrowWithTimeoutContext(error: unknown): never {
  if (error instanceof Error && error.name === "TimeoutError") {
    throw new Error(`リクエストがタイムアウトしました(${REQUEST_TIMEOUT_MS / 1000}秒)。`);
  }
  throw error;
}

/** JWT付きのGET/POSTリクエストを送る共通ヘルパー。method/bodyを指定しない場合はGET。 */
async function authorizedFetch(path: string, accept: string, options?: { method?: string; body?: unknown }): Promise<Response> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const method = options?.method ?? "GET";
  const hasBody = options?.body !== undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(options?.body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    rethrowWithTimeoutContext(error);
  }

  if (!response.ok) {
    await throwForErrorResponse(response);
  }

  return response;
}

/** JSON:APIレスポンスを返すGETリクエスト。path はベースURLからの相対パス、または links.next のフルURL。 */
export async function getJson<T = unknown>(path: string): Promise<T> {
  const response = await authorizedFetch(path, "application/json");
  return (await response.json()) as T;
}

/** JSON:APIボディを送るPOSTリクエスト。 */
export async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await authorizedFetch(path, "application/json", { method: "POST", body });
  return (await response.json()) as T;
}

/** JSON:APIボディを送り、レスポンスボディを必要としないPOSTリクエスト。 */
export async function postRequest(path: string, body: unknown): Promise<void> {
  await authorizedFetch(path, "application/json", { method: "POST", body });
}

/**
 * JSON:APIボディを送るPATCHリクエスト。
 * 通常は200でJSONボディを返すが、リレーションシップ更新系(例: appStoreVersions/relationships/build)は
 * 204で空ボディを返すため、その場合はundefinedを返す。
 */
export async function patchJson<T = unknown>(path: string, body: unknown): Promise<T | undefined> {
  const response = await authorizedFetch(path, "application/json", { method: "PATCH", body });
  if (response.status === 204) {
    return undefined;
  }
  return (await response.json()) as T;
}

/** ボディなしのDELETEリクエスト。ASCのDELETE系エンドポイントは204で空ボディを返す。 */
export async function deleteRequest(path: string): Promise<void> {
  await authorizedFetch(path, "application/json", { method: "DELETE" });
}

export interface UploadOperation {
  method: string;
  url: string;
  offset: number;
  length: number;
  requestHeaders?: Array<{ name: string; value: string }>;
}

/** ASCが返した予約済みURLへ、指定された範囲とヘッダーでファイルをアップロードする。 */
export async function uploadAsset(filePath: string, operations: UploadOperation[]): Promise<string> {
  const file = await readFile(filePath);
  for (const operation of operations) {
    const end = operation.offset + operation.length;
    const body = file.subarray(operation.offset, end);
    if (body.length !== operation.length) {
      throw new Error(`アップロード対象の範囲がファイルサイズを超えています: offset=${operation.offset}, length=${operation.length}`);
    }
    const response = await fetch(operation.url, {
      method: operation.method,
      headers: Object.fromEntries((operation.requestHeaders ?? []).map(({ name, value }) => [name, value])),
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`アセットのアップロードに失敗しました (HTTP ${response.status})。`);
    }
  }
  return createHash("md5").update(file).digest("hex");
}

/** gzipバイナリ(Accept: application/a-gzip)を返すGETリクエスト。展開してTSV文字列を返す。 */
export async function getGzipTsv(path: string): Promise<string> {
  const response = await authorizedFetch(path, "application/a-gzip");
  const buffer = Buffer.from(await response.arrayBuffer());
  return gunzipSync(buffer, { maxOutputLength: GUNZIP_MAX_OUTPUT_LENGTH }).toString("utf8");
}

/** ツール呼び出し内で発生したエラーをMCPツール結果向けのテキストに変換する。 */
export function formatToolError(error: unknown): string {
  if (error instanceof MissingEnvVarsError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof AscApiRequestError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: 予期しないエラーが発生しました: ${String(error)}`;
}
