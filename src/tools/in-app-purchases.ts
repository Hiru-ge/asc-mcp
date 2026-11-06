import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson, patchJson, postJson, uploadAsset, type UploadOperation } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiListResponse, JsonApiSingleResponse } from "../types.js";
import { flattenResource, pickDefined, requireAttributes, textResult } from "./shared.js";

const iapTypeSchema = z.enum(["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"]);
const TERRITORIES_PAGE_LIMIT = 200;

interface ReviewScreenshotAttributes {
  fileName?: string;
  fileSize?: number;
  uploadOperations?: UploadOperation[];
}

function errorResult(error: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatToolError(error) }] };
}

/** 配信国の全件を取得する。IAPの配信国指定は全リストが要るので、nextを辿って集める。 */
async function fetchAllTerritoryIds(): Promise<string[]> {
  const ids: string[] = [];
  let path: string | undefined = buildListPath("/v1/territories", { limit: TERRITORIES_PAGE_LIMIT });
  while (path) {
    const page: JsonApiListResponse<unknown> = await getJson<JsonApiListResponse<unknown>>(path);
    ids.push(...page.data.map((territory) => territory.id));
    path = page.links?.next;
  }
  return ids;
}

export function registerInAppPurchaseTools(server: McpServer): void {
  const listSchema = z.object({ appId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_in_app_purchases",
    {
      title: "List In-App Purchases",
      description: "List in-app purchases (consumable, non-consumable, non-renewing subscription) of an app with their review states.",
      inputSchema: listSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId, limit, nextUrl }) => {
      try {
        const path = buildListPath(`/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2`, { limit }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const createSchema = z.object({
    appId: z.string().min(1),
    productId: z.string().min(1).describe("Store product identifier, e.g. com.example.app.coffee. Cannot be changed or reused after creation."),
    name: z.string().min(2).max(64).describe("Reference name shown only in App Store Connect."),
    inAppPurchaseType: iapTypeSchema,
    reviewNote: z.string().optional(),
    familySharable: z.boolean().optional(),
  }).strict();
  server.registerTool(
    "asc_create_in_app_purchase",
    {
      title: "Create In-App Purchase",
      description: "Create an in-app purchase in MISSING_METADATA state. Add localization, price, availability and a review screenshot afterwards.",
      inputSchema: createSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, ...fields }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v2/inAppPurchases", {
          data: {
            type: "inAppPurchases",
            attributes: pickDefined(fields),
            relationships: { app: { data: { type: "apps", id: appId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const updateSchema = z.object({
    inAppPurchaseId: z.string().min(1),
    name: z.string().min(2).max(64).optional(),
    reviewNote: z.string().optional(),
    familySharable: z.boolean().optional(),
  }).strict();
  server.registerTool(
    "asc_update_in_app_purchase",
    {
      title: "Update In-App Purchase",
      description: "Update the reference name, review note, or family sharing of an in-app purchase.",
      inputSchema: updateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ inAppPurchaseId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v2/inAppPurchases/${encodeURIComponent(inAppPurchaseId)}`,
          { data: { type: "inAppPurchases", id: inAppPurchaseId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: inAppPurchaseId });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const listLocalizationsSchema = z.object({ inAppPurchaseId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_in_app_purchase_localizations",
    {
      title: "List In-App Purchase Localizations",
      description: "List the display name and description per locale of an in-app purchase.",
      inputSchema: listLocalizationsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ inAppPurchaseId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v2/inAppPurchases/${encodeURIComponent(inAppPurchaseId)}/inAppPurchaseLocalizations`,
          { limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const createLocalizationSchema = z.object({
    inAppPurchaseId: z.string().min(1),
    locale: z.string().min(2).describe("Locale code such as ja or en-US."),
    name: z.string().min(2).max(30).describe("Display name shown to customers."),
    description: z.string().min(1).max(45).describe("Description shown to customers."),
  }).strict();
  server.registerTool(
    "asc_create_in_app_purchase_localization",
    {
      title: "Create In-App Purchase Localization",
      description: "Add a customer-facing display name and description for one locale of an in-app purchase.",
      inputSchema: createLocalizationSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ inAppPurchaseId, ...fields }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/inAppPurchaseLocalizations", {
          data: {
            type: "inAppPurchaseLocalizations",
            attributes: fields,
            relationships: { inAppPurchaseV2: { data: { type: "inAppPurchases", id: inAppPurchaseId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const pricePointsSchema = z.object({
    inAppPurchaseId: z.string().min(1),
    territory: z.string().length(3).describe("Three-letter territory code such as JPN."),
    limit: limitField,
    nextUrl: nextUrlField,
  }).strict();
  server.registerTool(
    "asc_list_in_app_purchase_price_points",
    {
      title: "List In-App Purchase Price Points",
      description: "List selectable customer prices and proceeds for an in-app purchase in one territory. Use the returned id with asc_set_in_app_purchase_price.",
      inputSchema: pricePointsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ inAppPurchaseId, territory, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v2/inAppPurchases/${encodeURIComponent(inAppPurchaseId)}/pricePoints`,
          { "filter[territory]": territory, limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const setPriceSchema = z.object({
    inAppPurchaseId: z.string().min(1),
    baseTerritory: z.string().length(3).default("JPN"),
    pricePointId: z.string().min(1).describe("Price point id from asc_list_in_app_purchase_price_points for the base territory. Other territories are equalized by Apple."),
  }).strict();
  server.registerTool(
    "asc_set_in_app_purchase_price",
    {
      title: "Set In-App Purchase Price",
      description: "Set the price schedule of an in-app purchase from a base-territory price point.",
      inputSchema: setPriceSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ inAppPurchaseId, baseTerritory, pricePointId }) => {
      try {
        // included内のリソースを指す仮ID。ASCは "${...}" 形式のローカルIDを受け付ける。
        const localPriceId = "${price1}";
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/inAppPurchasePriceSchedules", {
          data: {
            type: "inAppPurchasePriceSchedules",
            relationships: {
              inAppPurchase: { data: { type: "inAppPurchases", id: inAppPurchaseId } },
              baseTerritory: { data: { type: "territories", id: baseTerritory } },
              manualPrices: { data: [{ type: "inAppPurchasePrices", id: localPriceId }] },
            },
          },
          included: [
            {
              type: "inAppPurchasePrices",
              id: localPriceId,
              attributes: { startDate: null },
              relationships: {
                inAppPurchasePricePoint: { data: { type: "inAppPurchasePricePoints", id: pricePointId } },
              },
            },
          ],
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const availabilitySchema = z.object({
    inAppPurchaseId: z.string().min(1),
    territories: z.array(z.string().length(3)).optional().describe("Territory codes to sell in. Omit to sell in every territory."),
    availableInNewTerritories: z.boolean().default(true),
  }).strict();
  server.registerTool(
    "asc_set_in_app_purchase_availability",
    {
      title: "Set In-App Purchase Availability",
      description: "Choose the territories where an in-app purchase is sold. Omit territories to select all of them.",
      inputSchema: availabilitySchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ inAppPurchaseId, territories, availableInNewTerritories }) => {
      try {
        const territoryIds = territories ?? (await fetchAllTerritoryIds());
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/inAppPurchaseAvailabilities", {
          data: {
            type: "inAppPurchaseAvailabilities",
            attributes: { availableInNewTerritories },
            relationships: {
              inAppPurchase: { data: { type: "inAppPurchases", id: inAppPurchaseId } },
              availableTerritories: { data: territoryIds.map((id) => ({ type: "territories", id })) },
            },
          },
        });
        return textResult({ ...flattenResource(result.data), territoryCount: territoryIds.length });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const reviewScreenshotSchema = z.object({
    inAppPurchaseId: z.string().min(1),
    filePath: z.string().min(1),
  }).strict();
  server.registerTool(
    "asc_upload_in_app_purchase_review_screenshot",
    {
      title: "Upload In-App Purchase Review Screenshot",
      description: "Reserve, upload, and commit the App Review screenshot of an in-app purchase. Required before the purchase can be submitted.",
      inputSchema: reviewScreenshotSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ inAppPurchaseId, filePath }) => {
      try {
        const file = await stat(filePath);
        if (!file.isFile()) {
          throw new Error(`スクリーンショットのパスがファイルではありません: ${filePath}`);
        }
        const reservation = await postJson<JsonApiSingleResponse<ReviewScreenshotAttributes>>(
          "/v1/inAppPurchaseAppStoreReviewScreenshots",
          {
            data: {
              type: "inAppPurchaseAppStoreReviewScreenshots",
              attributes: { fileSize: file.size, fileName: basename(filePath) },
              relationships: { inAppPurchaseV2: { data: { type: "inAppPurchases", id: inAppPurchaseId } } },
            },
          }
        );
        const screenshotId = reservation.data.id;
        const operations = reservation.data.attributes?.uploadOperations ?? [];
        if (operations.length === 0) {
          throw new Error("App Store Connectからアップロード手順が返りませんでした。");
        }
        const checksum = await uploadAsset(filePath, operations);
        const committed = await patchJson<JsonApiSingleResponse<ReviewScreenshotAttributes>>(
          `/v1/inAppPurchaseAppStoreReviewScreenshots/${encodeURIComponent(screenshotId)}`,
          {
            data: {
              type: "inAppPurchaseAppStoreReviewScreenshots",
              id: screenshotId,
              attributes: { uploaded: true, sourceFileChecksum: checksum },
            },
          }
        );
        return textResult(committed ? flattenResource(committed.data) : { id: screenshotId, uploaded: true });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  const submitSchema = z.object({ inAppPurchaseId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_submit_in_app_purchase",
    {
      title: "Submit In-App Purchase",
      description: "Submit an in-app purchase for App Review. The first purchase of an app must be submitted together with an app version that includes it.",
      inputSchema: submitSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ inAppPurchaseId }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/inAppPurchaseSubmissions", {
          data: {
            type: "inAppPurchaseSubmissions",
            relationships: { inAppPurchaseV2: { data: { type: "inAppPurchases", id: inAppPurchaseId } } },
          },
        });
        return textResult({ id: result.data.id, inAppPurchaseId, submitted: true });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
