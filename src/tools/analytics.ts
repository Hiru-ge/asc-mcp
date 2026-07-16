/**
 * App Store Connect Analytics Reports API。
 * 「ensure(request)→list→get」の3段階フローで構成する。
 * asc_request_analytics_reports → asc_list_analytics_reports → asc_get_analytics_report_data
 */
import { gunzipSync } from "node:zlib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson, GUNZIP_MAX_OUTPUT_LENGTH, postJson, REQUEST_TIMEOUT_MS } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import { parseAnalyticsSegments } from "../services/tsv.js";
import type { JsonApiListResponse, JsonApiResource, JsonApiSingleResponse } from "../types.js";

enum AnalyticsReportCategory {
  APP_USAGE = "APP_USAGE",
  APP_STORE_ENGAGEMENT = "APP_STORE_ENGAGEMENT",
  COMMERCE = "COMMERCE",
  FRAMEWORK_USAGE = "FRAMEWORK_USAGE",
  PERFORMANCE = "PERFORMANCE",
}

enum ReportGranularity {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

const ONGOING_ACCESS_TYPE = "ONGOING";

// ---------------------------------------------------------------------------
// asc_request_analytics_reports
// ---------------------------------------------------------------------------

interface AnalyticsReportRequestAttributes {
  accessType?: string;
}

const RequestInputSchema = z
  .object({
    appId: z.string().min(1).describe("The App Store Connect app ID to request analytics reports for."),
  })
  .strict();

type RequestInput = z.infer<typeof RequestInputSchema>;

async function ensureAnalyticsReportRequest(appId: string): Promise<{ requestId: string; created: boolean }> {
  const existing = await getJson<JsonApiListResponse<AnalyticsReportRequestAttributes>>(
    `/v1/analyticsReportRequests?filter[app]=${encodeURIComponent(appId)}`
  );
  const ongoing = existing.data.find((r) => r.attributes?.accessType === ONGOING_ACCESS_TYPE);
  if (ongoing) {
    return { requestId: ongoing.id, created: false };
  }

  const created = await postJson<JsonApiSingleResponse<AnalyticsReportRequestAttributes>>(
    "/v1/analyticsReportRequests",
    {
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: ONGOING_ACCESS_TYPE },
        relationships: {
          app: { data: { type: "apps", id: appId } },
        },
      },
    }
  );
  return { requestId: created.data.id, created: true };
}

export function registerRequestAnalyticsReportsTool(server: McpServer): void {
  server.registerTool(
    "asc_request_analytics_reports",
    {
      title: "Request Analytics Reports",
      description: `Ensure an ONGOING analytics report request exists for an app. If one already exists it is reused; otherwise a new one is created. Call this first, before asc_list_analytics_reports.

Args:
  - appId (string, required): The App Store Connect app ID

Returns:
  {
    "requestId": string,     // pass to asc_list_analytics_reports
    "accessType": "ONGOING",
    "created": boolean,      // true if a new request was just created, false if an existing ONGOING request was reused
    "note": string           // reminds that report generation can take up to 48 hours after first creation
  }`,
      inputSchema: RequestInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: RequestInput) => {
      try {
        const { requestId, created } = await ensureAnalyticsReportRequest(params.appId);
        const output = {
          requestId,
          accessType: ONGOING_ACCESS_TYPE,
          created,
          note:
            "作成直後はレポートが生成されるまで最大48時間かかります。生成完了後にasc_list_analytics_reportsで利用可能なレポート一覧を確認してください。",
        };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_list_analytics_reports
// ---------------------------------------------------------------------------

interface AnalyticsReportAttributes {
  name?: string;
  category?: string;
}

interface AnalyticsReportItem {
  reportId: string;
  name: string;
  category: string;
}

function mapAnalyticsReport(resource: JsonApiResource<AnalyticsReportAttributes>): AnalyticsReportItem {
  return {
    reportId: resource.id,
    name: resource.attributes?.name ?? "",
    category: resource.attributes?.category ?? "",
  };
}

const ListInputSchema = z
  .object({
    requestId: z
      .string()
      .min(1)
      .describe("The analytics report request ID returned by asc_request_analytics_reports."),
    category: z
      .nativeEnum(AnalyticsReportCategory)
      .optional()
      .describe(
        "Filter by report category: APP_USAGE | APP_STORE_ENGAGEMENT | COMMERCE | FRAMEWORK_USAGE | PERFORMANCE."
      ),
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type ListInput = z.infer<typeof ListInputSchema>;

export function registerListAnalyticsReportsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_analytics_reports",
    {
      title: "List Analytics Reports",
      description: `List analytics reports available under an analytics report request. Call asc_request_analytics_reports first to obtain requestId.

Args:
  - requestId (string, required): The analytics report request ID
  - category (string, optional): Filter by category
  - limit (number): Maximum number of reports to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call

Returns:
  {
    "count": number,
    "items": [
      {
        "reportId": string,   // pass to asc_get_analytics_report_data
        "name": string,
        "category": string
      }
    ],
    "nextUrl": string | undefined
  }`,
      inputSchema: ListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListInput) => {
      try {
        const filter: Record<string, string | number | undefined> = { limit: params.limit };
        if (params.category) filter["filter[category]"] = params.category;

        const path = buildListPath(
          `/v1/analyticsReportRequests/${encodeURIComponent(params.requestId)}/reports`,
          filter,
          params.nextUrl
        );
        const result = await fetchAndFlattenList(path, mapAnalyticsReport);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_get_analytics_report_data
// ---------------------------------------------------------------------------

interface AnalyticsReportInstanceAttributes {
  granularity?: string;
  processingDate?: string;
}

interface AnalyticsReportSegmentAttributes {
  url?: string;
}

const GetDataInputSchema = z
  .object({
    reportId: z.string().min(1).describe("The analytics report ID returned by asc_list_analytics_reports."),
    granularity: z
      .nativeEnum(ReportGranularity)
      .default(ReportGranularity.DAILY)
      .describe("Report instance granularity: DAILY (default) | WEEKLY | MONTHLY."),
    processingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Processing date (YYYY-MM-DD) of the instance to fetch. If omitted, the latest instance is used."),
  })
  .strict();

type GetDataInput = z.infer<typeof GetDataInputSchema>;

/** granularity(・processingDate)に合致するレポートインスタンスを1件選ぶ。processingDate未指定時は最新を選ぶ。 */
async function selectReportInstance(
  reportId: string,
  granularity: string,
  processingDate?: string
): Promise<JsonApiResource<AnalyticsReportInstanceAttributes>> {
  // processingDate未指定時に最新を選ぶため、1ページで取れる最大件数を取得する
  let query = `filter[granularity]=${granularity}&limit=200`;
  if (processingDate) {
    query += `&filter[processingDate]=${processingDate}`;
  }
  const response = await getJson<JsonApiListResponse<AnalyticsReportInstanceAttributes>>(
    `/v1/analyticsReports/${encodeURIComponent(reportId)}/instances?${query}`
  );

  if (response.data.length === 0) {
    throw new Error(
      "指定した条件のレポートインスタンスが見つかりません。レポートがまだ生成されていない可能性があります。" +
        "asc_request_analytics_reportsでONGOINGリクエストを作成済みの場合、レポート生成には最大48時間かかることがあります。"
    );
  }

  if (processingDate) {
    return response.data[0];
  }

  return response.data.reduce((latest, current) => {
    const latestDate = latest.attributes?.processingDate ?? "";
    const currentDate = current.attributes?.processingDate ?? "";
    return currentDate > latestDate ? current : latest;
  });
}

/** 署名付きURLからセグメントデータを取得する。ASCのJWT認証は不要なため素のfetchを使う。 */
async function fetchSegmentText(url: string): Promise<string> {
  if (new URL(url).protocol !== "https:") {
    throw new Error("セグメントデータのURLがhttpsではありません。");
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`セグメントデータの取得がタイムアウトしました(${REQUEST_TIMEOUT_MS / 1000}秒)。`);
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(`セグメントデータの取得に失敗しました (HTTP ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return gunzipSync(buffer, { maxOutputLength: GUNZIP_MAX_OUTPUT_LENGTH }).toString("utf8");
}

export function registerGetAnalyticsReportDataTool(server: McpServer): void {
  server.registerTool(
    "asc_get_analytics_report_data",
    {
      title: "Get Analytics Report Data",
      description: `Fetch the data of an analytics report: resolves the latest (or specified) report instance, downloads and decompresses its segments, and returns a preview of the combined rows.

Args:
  - reportId (string, required): The analytics report ID returned by asc_list_analytics_reports
  - granularity (string): "DAILY" (default) | "WEEKLY" | "MONTHLY"
  - processingDate (string, optional): YYYY-MM-DD. If omitted, the latest available instance is used.

Returns:
  {
    "reportId": string,
    "instanceId": string,
    "processingDate": string,     // YYYY-MM-DD
    "granularity": string,
    "segmentCount": number,
    "totalRows": number,          // total number of data rows across all segments
    "returnedRows": number,       // number of rows included in this response (max 50)
    "truncated": boolean,         // true if totalRows > returnedRows
    "rows": [ { <column>: <value>, ... } ]
  }

Error Handling:
  - Returns an error if no report instance matches the given granularity/processingDate (report may not be generated yet; can take up to 48 hours after the ONGOING request was created)`,
      inputSchema: GetDataInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetDataInput) => {
      try {
        const instance = await selectReportInstance(params.reportId, params.granularity, params.processingDate);
        const instanceId = instance.id;
        const processingDate = instance.attributes?.processingDate ?? "";

        const segmentsResponse = await getJson<JsonApiListResponse<AnalyticsReportSegmentAttributes>>(
          `/v1/analyticsReportInstances/${encodeURIComponent(instanceId)}/segments`
        );
        const segmentUrls = segmentsResponse.data
          .map((s) => s.attributes?.url)
          .filter((url): url is string => Boolean(url));

        if (segmentUrls.length === 0) {
          throw new Error("このレポートインスタンスにはダウンロード可能なセグメントがありません。");
        }

        const segmentTexts = await Promise.all(segmentUrls.map(fetchSegmentText));
        const { rows, totalRows } = parseAnalyticsSegments(segmentTexts);

        const output = {
          reportId: params.reportId,
          instanceId,
          processingDate,
          granularity: params.granularity,
          segmentCount: segmentUrls.length,
          totalRows,
          returnedRows: rows.length,
          truncated: totalRows > rows.length,
          rows,
        };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
