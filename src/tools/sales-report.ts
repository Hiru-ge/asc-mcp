import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireVendorNumber } from "../auth.js";
import { formatToolError, getGzipTsv } from "../client.js";
import { parseTsvPreview } from "../services/tsv.js";

enum ReportFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

const REPORT_DATE_FORMATS: Record<ReportFrequency, RegExp> = {
  [ReportFrequency.DAILY]: /^\d{4}-\d{2}-\d{2}$/,
  [ReportFrequency.WEEKLY]: /^\d{4}-\d{2}-\d{2}$/,
  [ReportFrequency.MONTHLY]: /^\d{4}-\d{2}$/,
  [ReportFrequency.YEARLY]: /^\d{4}$/,
};

// NOTE: 日付フォーマットのfrequency依存バリデーションはsuperRefineで行わない。
// z.object(...).superRefine(...) はZodEffectsとなり、SDKのJSON Schema変換で
// inputSchemaのpropertiesが失われてしまうため、素のZodObjectを維持しハンドラ内で検証する。
const InputSchema = z
  .object({
    reportDate: z
      .string()
      .min(4)
      .describe(
        "The report date. Format depends on frequency: DAILY/WEEKLY = YYYY-MM-DD, MONTHLY = YYYY-MM, YEARLY = YYYY."
      ),
    frequency: z
      .nativeEnum(ReportFrequency)
      .default(ReportFrequency.DAILY)
      .describe("Report frequency: DAILY (default), WEEKLY, MONTHLY, or YEARLY."),
  })
  .strict();

type Input = z.infer<typeof InputSchema>;

/** reportDateがfrequencyに応じたフォーマットかを検証する。不一致ならエラーメッセージを返す。 */
function validateReportDateFormat(input: Input): string | undefined {
  const expectedFormat = REPORT_DATE_FORMATS[input.frequency];
  if (!expectedFormat.test(input.reportDate)) {
    return `Error: reportDate '${input.reportDate}' does not match the expected format for frequency '${input.frequency}' (${expectedFormat.source}).`;
  }
  return undefined;
}

export function registerGetSalesReportTool(server: McpServer): void {
  server.registerTool(
    "asc_get_sales_report",
    {
      title: "Get Sales Report",
      description: `Fetch a sales summary report (SALES / SUMMARY / version 1.0) for the vendor configured via the ASC_VENDOR_NUMBER environment variable.

Args:
  - reportDate (string, required): Date of the report. Format depends on frequency:
      DAILY / WEEKLY -> "YYYY-MM-DD"
      MONTHLY        -> "YYYY-MM"
      YEARLY         -> "YYYY"
  - frequency (string): "DAILY" (default) | "WEEKLY" | "MONTHLY" | "YEARLY"

Returns:
  {
    "totalRows": number,          // total number of data rows in the report
    "returnedRows": number,       // number of rows included in this response (max 50)
    "truncated": boolean,         // true if totalRows > returnedRows
    "rows": [ { <TSV column>: <value>, ... } ]
  }

Error Handling:
  - Returns an error if ASC_VENDOR_NUMBER is not set
  - Returns "Error: Resource not found" (HTTP 404) if no report exists for the given date/frequency`,
      inputSchema: InputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => {
      const formatError = validateReportDateFormat(params);
      if (formatError) {
        return { isError: true, content: [{ type: "text", text: formatError }] };
      }
      try {
        const vendorNumber = requireVendorNumber();
        const query = new URLSearchParams({
          "filter[frequency]": params.frequency,
          "filter[reportDate]": params.reportDate,
          "filter[reportType]": "SALES",
          "filter[reportSubType]": "SUMMARY",
          "filter[vendorNumber]": vendorNumber,
          "filter[version]": "1_0",
        });
        const tsv = await getGzipTsv(`/v1/salesReports?${query.toString()}`);
        const { rows, totalRows } = parseTsvPreview(tsv);

        const output = {
          totalRows,
          returnedRows: rows.length,
          truncated: totalRows > rows.length,
          rows,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: formatToolError(error) }],
        };
      }
    }
  );
}
