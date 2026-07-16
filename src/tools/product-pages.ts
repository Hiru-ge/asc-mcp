import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, patchJson, postJson } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiSingleResponse } from "../types.js";
import { flattenResource, pickDefined, requireAttributes, textResult } from "./shared.js";

const experimentStateSchema = z.enum([
  "PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW",
  "ACCEPTED", "APPROVED", "REJECTED", "COMPLETED", "STOPPED",
]);

export function registerProductPageTools(server: McpServer): void {
  const listExperimentsSchema = z.object({ versionId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_product_page_experiments",
    {
      title: "List Product Page Experiments",
      description: "List Product Page Optimization A/B experiments for an App Store version.",
      inputSchema: listExperimentsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ versionId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v2/appStoreVersions/${encodeURIComponent(versionId)}/appStoreVersionExperiments`,
          { limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const createExperimentSchema = z.object({
    versionId: z.string().min(1),
    name: z.string().min(1),
    trafficProportion: z.number().int().min(0).max(100),
  }).strict();
  server.registerTool(
    "asc_create_product_page_experiment",
    {
      title: "Create Product Page Experiment",
      description: "Create a Product Page Optimization experiment and set its traffic percentage.",
      inputSchema: createExperimentSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ versionId, ...attributes }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v2/appStoreVersionExperiments", {
          data: {
            type: "appStoreVersionExperiments",
            attributes,
            relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const updateExperimentSchema = z.object({
    experimentId: z.string().min(1),
    name: z.string().min(1).optional(),
    trafficProportion: z.number().int().min(0).max(100).optional(),
    state: experimentStateSchema.optional(),
  }).strict();
  server.registerTool(
    "asc_update_product_page_experiment",
    {
      title: "Update Product Page Experiment",
      description: "Rename, start, stop, complete, or change traffic for a Product Page Optimization experiment.",
      inputSchema: updateExperimentSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ experimentId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v2/appStoreVersionExperiments/${encodeURIComponent(experimentId)}`,
          { data: { type: "appStoreVersionExperiments", id: experimentId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: experimentId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const treatmentSchema = z.object({ experimentId: z.string().min(1), name: z.string().min(1), appIconName: z.string().optional() }).strict();
  server.registerTool(
    "asc_create_experiment_treatment",
    {
      title: "Create Experiment Treatment",
      description: "Create a named treatment variant for a Product Page Optimization experiment.",
      inputSchema: treatmentSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ experimentId, ...fields }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>(
          "/v1/appStoreVersionExperimentTreatments",
          {
            data: {
              type: "appStoreVersionExperimentTreatments",
              attributes: pickDefined(fields),
              relationships: {
                appStoreVersionExperimentV2: { data: { type: "appStoreVersionExperiments", id: experimentId } },
              },
            },
          }
        );
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listTreatmentsSchema = z.object({ experimentId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_experiment_treatments",
    {
      title: "List Experiment Treatments",
      description: "List the treatment variants in a Product Page Optimization experiment.",
      inputSchema: listTreatmentsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ experimentId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v2/appStoreVersionExperiments/${encodeURIComponent(experimentId)}/appStoreVersionExperimentTreatments`,
          { limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const treatmentLocalizationSchema = z.object({ treatmentId: z.string().min(1), locale: z.string().min(2) }).strict();
  server.registerTool(
    "asc_create_experiment_treatment_localization",
    {
      title: "Create Experiment Treatment Localization",
      description: "Create a locale container for treatment screenshots and previews.",
      inputSchema: treatmentLocalizationSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ treatmentId, locale }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>(
          "/v1/appStoreVersionExperimentTreatmentLocalizations",
          {
            data: {
              type: "appStoreVersionExperimentTreatmentLocalizations",
              attributes: { locale },
              relationships: {
                appStoreVersionExperimentTreatment: {
                  data: { type: "appStoreVersionExperimentTreatments", id: treatmentId },
                },
              },
            },
          }
        );
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listPagesSchema = z.object({ appId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_custom_product_pages",
    {
      title: "List Custom Product Pages",
      description: "List custom App Store product pages and their public URLs.",
      inputSchema: listPagesSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId, limit, nextUrl }) => {
      try {
        const path = buildListPath(`/v1/apps/${encodeURIComponent(appId)}/appCustomProductPages`, { limit }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const createPageSchema = z.object({ appId: z.string().min(1), name: z.string().min(1) }).strict();
  server.registerTool(
    "asc_create_custom_product_page",
    {
      title: "Create Custom Product Page",
      description: "Create a named custom App Store product page for targeted campaigns.",
      inputSchema: createPageSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, name }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/appCustomProductPages", {
          data: {
            type: "appCustomProductPages",
            attributes: { name },
            relationships: { app: { data: { type: "apps", id: appId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const updatePageSchema = z.object({ pageId: z.string().min(1), name: z.string().min(1).optional(), visible: z.boolean().optional() }).strict();
  server.registerTool(
    "asc_update_custom_product_page",
    {
      title: "Update Custom Product Page",
      description: "Rename or show and hide a custom product page.",
      inputSchema: updatePageSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ pageId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/appCustomProductPages/${encodeURIComponent(pageId)}`,
          { data: { type: "appCustomProductPages", id: pageId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: pageId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const createPageVersionSchema = z.object({ pageId: z.string().min(1), deepLink: z.string().url().optional() }).strict();
  server.registerTool(
    "asc_create_custom_product_page_version",
    {
      title: "Create Custom Product Page Version",
      description: "Create an editable version of a custom product page, with an optional app deep link.",
      inputSchema: createPageVersionSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ pageId, deepLink }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/appCustomProductPageVersions", {
          data: {
            type: "appCustomProductPageVersions",
            attributes: pickDefined({ deepLink }),
            relationships: { appCustomProductPage: { data: { type: "appCustomProductPages", id: pageId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listPageVersionsSchema = z.object({ pageId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_custom_product_page_versions",
    {
      title: "List Custom Product Page Versions",
      description: "List editable and reviewed versions of a custom product page.",
      inputSchema: listPageVersionsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ pageId, limit, nextUrl }) => {
      try {
        const path = buildListPath(
          `/v1/appCustomProductPages/${encodeURIComponent(pageId)}/appCustomProductPageVersions`,
          { limit },
          nextUrl
        );
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const updatePageVersionSchema = z.object({
    pageVersionId: z.string().min(1),
    deepLink: z.string().url().nullable().optional(),
  }).strict();
  server.registerTool(
    "asc_update_custom_product_page_version",
    {
      title: "Update Custom Product Page Version",
      description: "Update the app deep link for an editable custom product page version.",
      inputSchema: updatePageVersionSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ pageVersionId, deepLink }) => {
      try {
        const attributes = pickDefined({ deepLink });
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/appCustomProductPageVersions/${encodeURIComponent(pageVersionId)}`,
          { data: { type: "appCustomProductPageVersions", id: pageVersionId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: pageVersionId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const pageLocalizationSchema = z.object({ pageVersionId: z.string().min(1), locale: z.string().min(2), promotionalText: z.string().optional() }).strict();
  server.registerTool(
    "asc_create_custom_product_page_localization",
    {
      title: "Create Custom Product Page Localization",
      description: "Create localized promotional text and an asset container for a custom product page version.",
      inputSchema: pageLocalizationSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ pageVersionId, ...fields }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>(
          "/v1/appCustomProductPageLocalizations",
          {
            data: {
              type: "appCustomProductPageLocalizations",
              attributes: pickDefined(fields),
              relationships: {
                appCustomProductPageVersion: {
                  data: { type: "appCustomProductPageVersions", id: pageVersionId },
                },
              },
            },
          }
        );
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
