#!/usr/bin/env node
/**
 * App Store Connect API 用の個人向けMCPサーバー(stdio)。
 *
 * 認証情報(ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY_PATH)は
 * ツール呼び出し時に検証する。未設定でもサーバー自体は起動する。
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerListAppsTool } from "./tools/apps.js";
import { registerListCustomerReviewsTool, registerReplyToReviewTool } from "./tools/reviews.js";
import { registerListBuildsTool } from "./tools/builds.js";
import { registerListAppStoreVersionsTool } from "./tools/app-store-versions.js";
import { registerGetSalesReportTool } from "./tools/sales-report.js";
import { registerSearchRankingTool } from "./tools/search-ranking.js";
import {
  registerRequestAnalyticsReportsTool,
  registerListAnalyticsReportsTool,
  registerGetAnalyticsReportDataTool,
} from "./tools/analytics.js";
import {
  registerCreateAppStoreVersionTool,
  registerCreateVersionLocalizationTool,
  registerListAppInfoLocalizationsTool,
  registerListVersionLocalizationsTool,
  registerSetVersionBuildTool,
  registerUpdateAppInfoLocalizationTool,
  registerUpdateVersionLocalizationTool,
} from "./tools/versions.js";
import { registerReviewSubmissionTools } from "./tools/review-submission.js";
import { registerScreenshotTools } from "./tools/screenshots.js";
import { registerReleaseTools } from "./tools/release.js";
import { registerTestFlightTools } from "./tools/testflight.js";
import { registerProductPageTools } from "./tools/product-pages.js";
import { registerDiagnosticTools } from "./tools/diagnostics.js";
import { registerInAppPurchaseTools } from "./tools/in-app-purchases.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const server = new McpServer({
  name: "app-store-connect",
  version,
});

registerListAppsTool(server);
registerListCustomerReviewsTool(server);
registerReplyToReviewTool(server);
registerListBuildsTool(server);
registerListAppStoreVersionsTool(server);
registerGetSalesReportTool(server);
registerSearchRankingTool(server);
registerRequestAnalyticsReportsTool(server);
registerListAnalyticsReportsTool(server);
registerGetAnalyticsReportDataTool(server);
registerCreateAppStoreVersionTool(server);
registerCreateVersionLocalizationTool(server);
registerListVersionLocalizationsTool(server);
registerUpdateVersionLocalizationTool(server);
registerListAppInfoLocalizationsTool(server);
registerUpdateAppInfoLocalizationTool(server);
registerSetVersionBuildTool(server);
registerReviewSubmissionTools(server);
registerScreenshotTools(server);
registerReleaseTools(server);
registerTestFlightTools(server);
registerProductPageTools(server);
registerDiagnosticTools(server);
registerInAppPurchaseTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("app-store-connect MCP server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
