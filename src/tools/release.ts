import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson, patchJson, postJson } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiSingleResponse } from "../types.js";
import { flattenResource, pickDefined, requireAttributes, textResult } from "./shared.js";

const releaseTypeSchema = z.enum(["MANUAL", "AFTER_APPROVAL", "SCHEDULED"]);
const phasedStateSchema = z.enum(["INACTIVE", "ACTIVE", "PAUSED", "COMPLETE"]);

export function registerReleaseTools(server: McpServer): void {
  const updateVersionSchema = z.object({
    versionId: z.string().min(1),
    versionString: z.string().optional(),
    copyright: z.string().optional(),
    releaseType: releaseTypeSchema.optional(),
    earliestReleaseDate: z.string().datetime().nullable().optional(),
    usesIdfa: z.boolean().optional(),
    downloadable: z.boolean().optional(),
  }).strict();
  server.registerTool(
    "asc_update_app_store_version",
    {
      title: "Update App Store Version",
      description: "Update version metadata and choose manual, automatic, or scheduled release behavior.",
      inputSchema: updateVersionSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ versionId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/appStoreVersions/${encodeURIComponent(versionId)}`,
          { data: { type: "appStoreVersions", id: versionId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: versionId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const phasedCreateSchema = z.object({ versionId: z.string().min(1), phasedReleaseState: phasedStateSchema.default("INACTIVE") }).strict();
  server.registerTool(
    "asc_enable_phased_release",
    {
      title: "Enable Phased Release",
      description: "Enable a seven-day phased release for an App Store version.",
      inputSchema: phasedCreateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ versionId, phasedReleaseState }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/appStoreVersionPhasedReleases", {
          data: {
            type: "appStoreVersionPhasedReleases",
            attributes: { phasedReleaseState },
            relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const phasedUpdateSchema = z.object({ phasedReleaseId: z.string().min(1), phasedReleaseState: phasedStateSchema }).strict();
  server.registerTool(
    "asc_update_phased_release",
    {
      title: "Update Phased Release",
      description: "Start, pause, resume, or complete an existing phased release.",
      inputSchema: phasedUpdateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ phasedReleaseId, phasedReleaseState }) => {
      try {
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/appStoreVersionPhasedReleases/${encodeURIComponent(phasedReleaseId)}`,
          { data: { type: "appStoreVersionPhasedReleases", id: phasedReleaseId, attributes: { phasedReleaseState } } }
        );
        return textResult(result ? flattenResource(result.data) : { id: phasedReleaseId, phasedReleaseState });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const manualReleaseSchema = z.object({ versionId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_release_app_store_version",
    {
      title: "Release Approved Version",
      description: "Release an approved App Store version that is waiting for a manual release.",
      inputSchema: manualReleaseSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ versionId }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/appStoreVersionReleaseRequests", {
          data: {
            type: "appStoreVersionReleaseRequests",
            relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
          },
        });
        return textResult({ id: result.data.id, versionId, releaseRequested: true });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const pricePointsSchema = z.object({
    appId: z.string().min(1),
    territory: z.string().length(3),
    limit: limitField,
    nextUrl: nextUrlField,
  }).strict();
  server.registerTool(
    "asc_list_app_price_points",
    {
      title: "List App Price Points",
      description: "List selectable customer prices and proceeds for an app in one territory.",
      inputSchema: pricePointsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId, territory, limit, nextUrl }) => {
      try {
        const path = buildListPath(`/v1/apps/${encodeURIComponent(appId)}/appPricePoints`, {
          "filter[territory]": territory,
          include: "territory",
          limit,
        }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const priceScheduleSchema = z.object({ appId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_get_app_price_schedule",
    {
      title: "Get App Price Schedule",
      description: "Get the current and scheduled manual prices for an app, including their price point IDs.",
      inputSchema: priceScheduleSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId }) => {
      try {
        const result = await getJson<unknown>(
          `/v1/apps/${encodeURIComponent(appId)}/appPriceSchedule?include=baseTerritory,manualPrices`
        );
        return textResult(result);
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const setPriceSchema = z.object({
    appId: z.string().min(1),
    baseTerritory: z.string().length(3),
    pricePointId: z.string().min(1),
    currentPricePointId: z.string().min(1).optional(),
    startDate: z.string().date().nullable().default(null),
    endDate: z.string().date().nullable().default(null),
  }).strict().refine((value) => value.startDate === null || value.currentPricePointId !== undefined, {
    message: "将来の価格変更を予約する場合はcurrentPricePointIdも指定してください。",
  });
  server.registerTool(
    "asc_set_app_price",
    {
      title: "Set App Price",
      description: "Set or schedule an app price from a price point in the base territory; other territories are equalized automatically.",
      inputSchema: setPriceSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, baseTerritory, pricePointId, currentPricePointId, startDate, endDate }) => {
      try {
        const newPriceId = "${price-new}";
        const currentPriceId = "${price-current}";
        const manualPrices = startDate
          ? [
              {
                type: "appPrices",
                id: currentPriceId,
                attributes: { startDate: null, endDate: startDate },
                relationships: {
                  appPricePoint: { data: { type: "appPricePoints", id: currentPricePointId } },
                },
              },
              {
                type: "appPrices",
                id: newPriceId,
                attributes: { startDate, endDate },
                relationships: { appPricePoint: { data: { type: "appPricePoints", id: pricePointId } } },
              },
            ]
          : [
              {
                type: "appPrices",
                id: newPriceId,
                attributes: { startDate: null, endDate },
                relationships: { appPricePoint: { data: { type: "appPricePoints", id: pricePointId } } },
              },
            ];
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/appPriceSchedules", {
          data: {
            type: "appPriceSchedules",
            attributes: {},
            relationships: {
              app: { data: { type: "apps", id: appId } },
              baseTerritory: { data: { type: "territories", id: baseTerritory } },
              manualPrices: { data: manualPrices.map(({ type, id }) => ({ type, id })) },
            },
          },
          included: manualPrices,
        });
        return textResult({ id: result.data.id, appId, baseTerritory, pricePointId, startDate, endDate });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const availabilitySchema = z.object({ appId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_get_app_availability",
    {
      title: "Get App Availability",
      description: "Get global and per-territory App Store availability, release, and pre-order settings.",
      inputSchema: availabilitySchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId }) => {
      try {
        const result = await getJson<unknown>(
          `/v1/apps/${encodeURIComponent(appId)}/appAvailabilityV2?include=territoryAvailabilities&limit[territoryAvailabilities]=50`
        );
        return textResult(result);
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const territoryListSchema = z.object({
    appAvailabilityId: z.string().min(1),
    limit: limitField,
    nextUrl: nextUrlField,
  }).strict();
  server.registerTool(
    "asc_list_territory_availabilities",
    {
      title: "List Territory Availabilities",
      description: "List every territory availability with pagination for an app availability resource.",
      inputSchema: territoryListSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appAvailabilityId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v2/appAvailabilities/${encodeURIComponent(appAvailabilityId)}/territoryAvailabilities`,
          { limit, include: "territory" },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const territorySchema = z.object({
    territoryAvailabilityId: z.string().min(1),
    available: z.boolean().optional(),
    releaseDate: z.string().date().nullable().optional(),
    preOrderEnabled: z.boolean().optional(),
    preOrderPublishDate: z.string().date().nullable().optional(),
  }).strict();
  server.registerTool(
    "asc_update_territory_availability",
    {
      title: "Update Territory Availability",
      description: "Enable or disable an app in one territory and update its release or pre-order dates.",
      inputSchema: territorySchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ territoryAvailabilityId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/territoryAvailabilities/${encodeURIComponent(territoryAvailabilityId)}`,
          { data: { type: "territoryAvailabilities", id: territoryAvailabilityId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: territoryAvailabilityId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
