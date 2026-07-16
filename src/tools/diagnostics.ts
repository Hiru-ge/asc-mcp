import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import { flattenResource, textResult } from "./shared.js";

const metricTypeSchema = z.enum([
  "DISK", "HANG", "BATTERY", "LAUNCH", "MEMORY", "ANIMATION", "TERMINATION", "STORAGE",
]);

export function registerDiagnosticTools(server: McpServer): void {
  const metricsSchema = z.object({
    resourceType: z.enum(["app", "build"]),
    resourceId: z.string().min(1),
    metricType: metricTypeSchema.optional(),
    deviceType: z.string().optional(),
    platform: z.enum(["IOS"]).default("IOS"),
  }).strict();
  server.registerTool(
    "asc_get_performance_metrics",
    {
      title: "Get Power and Performance Metrics",
      description: "Get launch time, hangs, memory, battery, disk, animation, termination, or storage metrics for an app or build.",
      inputSchema: metricsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ resourceType, resourceId, metricType, deviceType, platform }) => {
      try {
        const collection = resourceType === "app" ? "apps" : "builds";
        const path = buildListPath(`/v1/${collection}/${encodeURIComponent(resourceId)}/perfPowerMetrics`, {
          "filter[metricType]": metricType,
          "filter[deviceType]": deviceType,
          "filter[platform]": platform,
        });
        return textResult(await getJson<unknown>(path));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const signaturesSchema = z.object({
    buildId: z.string().min(1),
    diagnosticType: z.string().optional(),
    limit: limitField,
    nextUrl: nextUrlField,
  }).strict();
  server.registerTool(
    "asc_list_diagnostic_signatures",
    {
      title: "List Diagnostic Signatures",
      description: "List recurring crash, hang, and disk-write signatures collected for a build.",
      inputSchema: signaturesSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ buildId, diagnosticType, limit, nextUrl }) => {
      try {
        const path = buildListPath(`/v1/builds/${encodeURIComponent(buildId)}/diagnosticSignatures`, {
          "filter[diagnosticType]": diagnosticType,
          limit,
        }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const logsSchema = z.object({ signatureId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_get_diagnostic_logs",
    {
      title: "Get Diagnostic Logs",
      description: "Download anonymized call-stack logs and insights for one diagnostic signature.",
      inputSchema: logsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ signatureId }) => {
      try {
        return textResult(await getJson<unknown>(`/v1/diagnosticSignatures/${encodeURIComponent(signatureId)}/logs`));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
