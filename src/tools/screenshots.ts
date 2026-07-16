import { basename } from "node:path";
import { stat } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deleteRequest, formatToolError, patchJson, postJson, uploadAsset } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiResource, JsonApiSingleResponse } from "../types.js";
import { flattenResource, textResult } from "./shared.js";

interface ScreenshotAttributes extends Record<string, unknown> {
  fileSize?: number;
  fileName?: string;
  sourceFileChecksum?: string;
  uploadOperations?: Array<{
    method: string;
    url: string;
    offset: number;
    length: number;
    requestHeaders?: Array<{ name: string; value: string }>;
  }>;
  assetDeliveryState?: unknown;
}

export function registerScreenshotTools(server: McpServer): void {
  const createSetSchema = z.object({
    localizationId: z.string().min(1),
    localizationType: z.enum(["version", "experimentTreatment", "customProductPage"]).default("version"),
    screenshotDisplayType: z.string().min(1),
  }).strict();
  server.registerTool(
    "asc_create_screenshot_set",
    {
      title: "Create Screenshot Set",
      description: "Create a screenshot container for one App Store version locale and display type.",
      inputSchema: createSetSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ localizationId, localizationType, screenshotDisplayType }) => {
      try {
        const relationshipByType = {
          version: ["appStoreVersionLocalization", "appStoreVersionLocalizations"],
          experimentTreatment: [
            "appStoreVersionExperimentTreatmentLocalization",
            "appStoreVersionExperimentTreatmentLocalizations",
          ],
          customProductPage: ["appCustomProductPageLocalization", "appCustomProductPageLocalizations"],
        } as const;
        const [relationshipName, resourceType] = relationshipByType[localizationType];
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/appScreenshotSets", {
          data: {
            type: "appScreenshotSets",
            attributes: { screenshotDisplayType },
            relationships: { [relationshipName]: { data: { type: resourceType, id: localizationId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listSetsSchema = z.object({ localizationId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_screenshot_sets",
    {
      title: "List Screenshot Sets",
      description: "List screenshot sets for an App Store version localization.",
      inputSchema: listSetsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ localizationId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v1/appStoreVersionLocalizations/${encodeURIComponent(localizationId)}/appScreenshotSets`,
          { limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listScreenshotsSchema = z.object({ screenshotSetId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_screenshots",
    {
      title: "List Screenshots",
      description: "List the ordered screenshots and upload processing states in a screenshot set.",
      inputSchema: listScreenshotsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ screenshotSetId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v1/appScreenshotSets/${encodeURIComponent(screenshotSetId)}/appScreenshots`,
          { limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList<ScreenshotAttributes, Record<string, unknown>>(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const uploadSchema = z.object({ screenshotSetId: z.string().min(1), filePath: z.string().min(1) }).strict();
  server.registerTool(
    "asc_upload_screenshot",
    {
      title: "Upload Screenshot",
      description: "Reserve, upload, and commit one local screenshot file to an existing screenshot set.",
      inputSchema: uploadSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ screenshotSetId, filePath }) => {
      try {
        const file = await stat(filePath);
        if (!file.isFile()) {
          throw new Error(`スクリーンショットのパスがファイルではありません: ${filePath}`);
        }
        const reservation = await postJson<JsonApiSingleResponse<ScreenshotAttributes>>("/v1/appScreenshots", {
          data: {
            type: "appScreenshots",
            attributes: { fileSize: file.size, fileName: basename(filePath) },
            relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: screenshotSetId } } },
          },
        });
        const screenshotId = reservation.data.id;
        const operations = reservation.data.attributes?.uploadOperations ?? [];
        if (operations.length === 0) {
          throw new Error("App Store Connectからアップロード手順が返りませんでした。");
        }
        const checksum = await uploadAsset(filePath, operations);
        const committed = await patchJson<JsonApiSingleResponse<ScreenshotAttributes>>(
          `/v1/appScreenshots/${encodeURIComponent(screenshotId)}`,
          {
            data: {
              type: "appScreenshots",
              id: screenshotId,
              attributes: { uploaded: true, sourceFileChecksum: checksum },
            },
          }
        );
        return textResult(committed ? flattenResource(committed.data) : { id: screenshotId, uploaded: true });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const deleteSchema = z.object({ resourceType: z.enum(["screenshot", "set"]), id: z.string().min(1) }).strict();
  server.registerTool(
    "asc_delete_screenshot_resource",
    {
      title: "Delete Screenshot or Set",
      description: "Delete one screenshot, or a screenshot set and every screenshot it contains.",
      inputSchema: deleteSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ resourceType, id }) => {
      try {
        const collection = resourceType === "screenshot" ? "appScreenshots" : "appScreenshotSets";
        await deleteRequest(`/v1/${collection}/${encodeURIComponent(id)}`);
        return textResult({ id, resourceType, deleted: true });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
