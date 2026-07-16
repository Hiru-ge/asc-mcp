import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson, patchJson, postJson, postRequest } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiSingleResponse } from "../types.js";
import { flattenResource, pickDefined, requireAttributes, textResult } from "./shared.js";

export function registerTestFlightTools(server: McpServer): void {
  const listGroupsSchema = z.object({ appId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_beta_groups",
    {
      title: "List TestFlight Groups",
      description: "List internal and external TestFlight groups for an app.",
      inputSchema: listGroupsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId, limit, nextUrl }) => {
      try {
        const path = buildListPath(`/v1/apps/${encodeURIComponent(appId)}/betaGroups`, { limit }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const createGroupSchema = z.object({
    appId: z.string().min(1),
    name: z.string().min(1),
    isInternalGroup: z.boolean().default(false),
    publicLinkEnabled: z.boolean().optional(),
    publicLinkLimit: z.number().int().positive().optional(),
    publicLinkLimitEnabled: z.boolean().optional(),
  }).strict();
  server.registerTool(
    "asc_create_beta_group",
    {
      title: "Create TestFlight Group",
      description: "Create an internal or external TestFlight group, with optional public-link settings.",
      inputSchema: createGroupSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, ...fields }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/betaGroups", {
          data: {
            type: "betaGroups",
            attributes: pickDefined(fields),
            relationships: { app: { data: { type: "apps", id: appId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listTestersSchema = z.object({
    email: z.string().email().optional(),
    limit: limitField,
    nextUrl: nextUrlField,
  }).strict();
  server.registerTool(
    "asc_list_beta_testers",
    {
      title: "List TestFlight Testers",
      description: "List TestFlight testers, optionally filtering by exact email address.",
      inputSchema: listTestersSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ email, limit, nextUrl }) => {
      try {
        const path = buildListPath("/v1/betaTesters", { "filter[email]": email, limit }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const createTesterSchema = z.object({
    email: z.string().email(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }).strict();
  server.registerTool(
    "asc_create_beta_tester",
    {
      title: "Create TestFlight Tester",
      description: "Create or invite a TestFlight tester account.",
      inputSchema: createTesterSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (fields) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/betaTesters", {
          data: { type: "betaTesters", attributes: pickDefined(fields) },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const addToGroupSchema = z.object({
    groupId: z.string().min(1),
    resourceType: z.enum(["tester", "build"]),
    resourceIds: z.array(z.string().min(1)).min(1),
  }).strict();
  server.registerTool(
    "asc_add_to_beta_group",
    {
      title: "Add Testers or Builds to TestFlight Group",
      description: "Add one or more testers or builds to an existing TestFlight group.",
      inputSchema: addToGroupSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ groupId, resourceType, resourceIds }) => {
      try {
        const relationship = resourceType === "tester" ? "betaTesters" : "builds";
        const type = resourceType === "tester" ? "betaTesters" : "builds";
        await postRequest(`/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/${relationship}`, {
          data: resourceIds.map((id) => ({ type, id })),
        });
        return textResult({ groupId, resourceType, resourceIds, added: true });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const listLocalizationsSchema = z.object({ buildId: z.string().min(1), limit: limitField, nextUrl: nextUrlField }).strict();
  server.registerTool(
    "asc_list_beta_build_localizations",
    {
      title: "List TestFlight What to Test Localizations",
      description: "List localized What to Test text for a TestFlight build.",
      inputSchema: listLocalizationsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ buildId, limit, nextUrl }) => {
      try {
        const path = buildListPath(`/v1/builds/${encodeURIComponent(buildId)}/betaBuildLocalizations`, { limit }, nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const upsertLocalizationSchema = z.object({
    buildId: z.string().min(1).optional(),
    localizationId: z.string().min(1).optional(),
    locale: z.string().min(2).optional(),
    whatsNew: z.string().min(1),
  }).strict().refine((value) => value.localizationId || (value.buildId && value.locale), {
    message: "更新時はlocalizationId、作成時はbuildIdとlocaleを指定してください。",
  });
  server.registerTool(
    "asc_set_beta_build_localization",
    {
      title: "Set TestFlight What to Test",
      description: "Create or update localized What to Test text for a TestFlight build.",
      inputSchema: upsertLocalizationSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ buildId, localizationId, locale, whatsNew }) => {
      try {
        const result = localizationId
          ? await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
              `/v1/betaBuildLocalizations/${encodeURIComponent(localizationId)}`,
              { data: { type: "betaBuildLocalizations", id: localizationId, attributes: { whatsNew } } }
            )
          : await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/betaBuildLocalizations", {
              data: {
                type: "betaBuildLocalizations",
                attributes: { locale, whatsNew },
                relationships: { build: { data: { type: "builds", id: buildId } } },
              },
            });
        return textResult(result ? flattenResource(result.data) : { id: localizationId, whatsNew });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const getBuildDetailSchema = z.object({ buildId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_get_build_beta_details",
    {
      title: "Get TestFlight Build Details",
      description: "Get internal and external testing states and the buildBetaDetail ID for a build.",
      inputSchema: getBuildDetailSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ buildId }) => {
      try {
        const result = await getJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/builds/${encodeURIComponent(buildId)}/buildBetaDetail`
        );
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const buildDetailSchema = z.object({
    buildBetaDetailId: z.string().min(1),
    autoNotifyEnabled: z.boolean(),
  }).strict();
  server.registerTool(
    "asc_update_build_beta_details",
    {
      title: "Update TestFlight Build Details",
      description: "Enable or disable automatic tester invitations when an external build becomes available.",
      inputSchema: buildDetailSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ buildBetaDetailId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/buildBetaDetails/${encodeURIComponent(buildBetaDetailId)}`,
          { data: { type: "buildBetaDetails", id: buildBetaDetailId, attributes } }
        );
        return textResult(result ? flattenResource(result.data) : { id: buildBetaDetailId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const externalReviewSchema = z.object({ buildId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_submit_beta_app_review",
    {
      title: "Submit Build for External TestFlight Review",
      description: "Submit a build to Beta App Review before external TestFlight distribution.",
      inputSchema: externalReviewSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ buildId }) => {
      try {
        const result = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/betaAppReviewSubmissions", {
          data: {
            type: "betaAppReviewSubmissions",
            relationships: { build: { data: { type: "builds", id: buildId } } },
          },
        });
        return textResult(flattenResource(result.data));
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
