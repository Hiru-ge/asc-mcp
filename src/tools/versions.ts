/**
 * App Storeバージョンの作成・ローカライズ・ビルド紐付けを扱うツール群。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson, patchJson, postJson } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiListResponse, JsonApiResource, JsonApiSingleResponse } from "../types.js";

enum Platform {
  IOS = "IOS",
  MAC_OS = "MAC_OS",
  TV_OS = "TV_OS",
  VISION_OS = "VISION_OS",
}

// ---------------------------------------------------------------------------
// asc_create_app_store_version
// ---------------------------------------------------------------------------

interface AppStoreVersionAttributes {
  versionString?: string;
  appStoreState?: string;
  platform?: string;
}

const CreateVersionInputSchema = z
  .object({
    appId: z.string().min(1).describe("The App Store Connect app ID to create a new version for."),
    versionString: z.string().min(1).describe("The version number to create, e.g. '1.3.4'."),
    platform: z.nativeEnum(Platform).default(Platform.IOS).describe("Platform for the new version (default IOS)."),
  })
  .strict();

type CreateVersionInput = z.infer<typeof CreateVersionInputSchema>;

export function registerCreateAppStoreVersionTool(server: McpServer): void {
  server.registerTool(
    "asc_create_app_store_version",
    {
      title: "Create App Store Version",
      description: `Create a new App Store version (e.g. to start preparing the next release) for an app.

Args:
  - appId (string, required): The App Store Connect app ID
  - versionString (string, required): The version number, e.g. "1.3.4"
  - platform (string): "IOS" (default) | "MAC_OS" | "TV_OS" | "VISION_OS"

Returns:
  {
    "versionId": string,
    "versionString": string,
    "appStoreState": string   // typically "PREPARE_FOR_SUBMISSION" right after creation
  }

Error Handling:
  - Returns an error if a version with the same versionString already exists for the app`,
      inputSchema: CreateVersionInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: CreateVersionInput) => {
      try {
        const result = await postJson<JsonApiSingleResponse<AppStoreVersionAttributes>>("/v1/appStoreVersions", {
          data: {
            type: "appStoreVersions",
            attributes: {
              platform: params.platform,
              versionString: params.versionString,
            },
            relationships: {
              app: { data: { type: "apps", id: params.appId } },
            },
          },
        });
        const output = {
          versionId: result.data.id,
          versionString: result.data.attributes?.versionString ?? "",
          appStoreState: result.data.attributes?.appStoreState ?? "",
        };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

const CreateVersionLocalizationInputSchema = z.object({
  versionId: z.string().min(1),
  locale: z.string().min(2),
  description: z.string().optional(),
  keywords: z.string().optional(),
  whatsNew: z.string().optional(),
  promotionalText: z.string().optional(),
  supportUrl: z.string().url().optional(),
  marketingUrl: z.string().url().optional(),
}).strict();

type CreateVersionLocalizationInput = z.infer<typeof CreateVersionLocalizationInputSchema>;

export function registerCreateVersionLocalizationTool(server: McpServer): void {
  server.registerTool(
    "asc_create_version_localization",
    {
      title: "Create Version Localization",
      description: "Create localized App Store metadata for a version, including release notes, keywords, and promotional text.",
      inputSchema: CreateVersionLocalizationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ versionId, locale, ...fields }: CreateVersionLocalizationInput) => {
      try {
        const result = await postJson<JsonApiSingleResponse<VersionLocalizationAttributes>>(
          "/v1/appStoreVersionLocalizations",
          {
            data: {
              type: "appStoreVersionLocalizations",
              attributes: { locale, ...pickAttributes(fields) },
              relationships: {
                appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
              },
            },
          }
        );
        return { content: [{ type: "text", text: JSON.stringify(mapVersionLocalization(result.data), null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_list_version_localizations
// ---------------------------------------------------------------------------

interface VersionLocalizationAttributes {
  locale?: string;
  description?: string;
  keywords?: string;
  whatsNew?: string;
  promotionalText?: string;
  supportUrl?: string;
  marketingUrl?: string;
}

interface VersionLocalizationItem {
  id: string;
  locale: string;
  description: string;
  keywords: string;
  whatsNew: string;
  promotionalText: string;
  supportUrl: string;
  marketingUrl: string;
}

function mapVersionLocalization(
  resource: JsonApiResource<VersionLocalizationAttributes>
): VersionLocalizationItem {
  return {
    id: resource.id,
    locale: resource.attributes?.locale ?? "",
    description: resource.attributes?.description ?? "",
    keywords: resource.attributes?.keywords ?? "",
    whatsNew: resource.attributes?.whatsNew ?? "",
    promotionalText: resource.attributes?.promotionalText ?? "",
    supportUrl: resource.attributes?.supportUrl ?? "",
    marketingUrl: resource.attributes?.marketingUrl ?? "",
  };
}

const ListVersionLocalizationsInputSchema = z
  .object({
    versionId: z.string().min(1).describe("The App Store version ID to list localizations for."),
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type ListVersionLocalizationsInput = z.infer<typeof ListVersionLocalizationsInputSchema>;

export function registerListVersionLocalizationsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_version_localizations",
    {
      title: "List Version Localizations",
      description: `List per-locale App Store version metadata (description, keywords, what's new, etc.) for an App Store version.

Args:
  - versionId (string, required): The App Store version ID
  - limit (number): Maximum number of localizations to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call

Returns:
  {
    "count": number,
    "items": [
      {
        "id": string,                 // pass to asc_update_version_localization
        "locale": string,             // e.g. "ja", "en-US"
        "description": string,
        "keywords": string,
        "whatsNew": string,
        "promotionalText": string,
        "supportUrl": string,
        "marketingUrl": string
      }
    ],
    "nextUrl": string | undefined
  }`,
      inputSchema: ListVersionLocalizationsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListVersionLocalizationsInput) => {
      try {
        const path = buildListPath(
          `/v1/appStoreVersions/${encodeURIComponent(params.versionId)}/appStoreVersionLocalizations`,
          { limit: params.limit },
          params.nextUrl
        );
        const result = await fetchAndFlattenList(path, mapVersionLocalization);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_update_version_localization
// ---------------------------------------------------------------------------

const UpdateVersionLocalizationInputSchema = z
  .object({
    localizationId: z.string().min(1).describe("The App Store version localization ID to update."),
    description: z.string().optional().describe("App description for this locale."),
    keywords: z.string().optional().describe("Comma-separated keywords for this locale."),
    whatsNew: z.string().optional().describe("\"What's New\" release notes for this locale."),
    promotionalText: z.string().optional().describe("Promotional text for this locale."),
    supportUrl: z.string().url().optional().describe("Support URL for this locale."),
    marketingUrl: z.string().url().optional().describe("Marketing URL for this locale."),
  })
  .strict();

type UpdateVersionLocalizationInput = z.infer<typeof UpdateVersionLocalizationInputSchema>;

function pickAttributes<T extends Record<string, unknown>>(fields: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

export function registerUpdateVersionLocalizationTool(server: McpServer): void {
  server.registerTool(
    "asc_update_version_localization",
    {
      title: "Update Version Localization",
      description: `Update per-locale App Store version metadata. Only the fields you pass are updated; omitted fields are left unchanged.

Note: promotionalText can be updated anytime; other fields (description, keywords, whatsNew, supportUrl, marketingUrl) can only be updated while the version is in an editable state (e.g. PREPARE_FOR_SUBMISSION, DEVELOPER_REJECTED, REJECTED).

Args:
  - localizationId (string, required): The App Store version localization ID (from asc_list_version_localizations)
  - description (string, optional)
  - keywords (string, optional): comma-separated
  - whatsNew (string, optional)
  - promotionalText (string, optional)
  - supportUrl (string, optional)
  - marketingUrl (string, optional)

At least one of the optional fields must be provided.

Returns:
  {
    "id": string,
    "locale": string,
    "description": string,
    "keywords": string,
    "whatsNew": string,
    "promotionalText": string,
    "supportUrl": string,
    "marketingUrl": string
  }

Error Handling:
  - Returns an error if no updatable field is provided
  - Returns an error if the version is not in an editable state for the fields being changed`,
      inputSchema: UpdateVersionLocalizationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: UpdateVersionLocalizationInput) => {
      try {
        const attributes = pickAttributes({
          description: params.description,
          keywords: params.keywords,
          whatsNew: params.whatsNew,
          promotionalText: params.promotionalText,
          supportUrl: params.supportUrl,
          marketingUrl: params.marketingUrl,
        });
        if (Object.keys(attributes).length === 0) {
          throw new Error(
            "更新するフィールドが1つも指定されていません。description/keywords/whatsNew/promotionalText/supportUrl/marketingUrlのいずれかを指定してください。"
          );
        }

        const result = await patchJson<JsonApiSingleResponse<VersionLocalizationAttributes>>(
          `/v1/appStoreVersionLocalizations/${encodeURIComponent(params.localizationId)}`,
          {
            data: {
              type: "appStoreVersionLocalizations",
              id: params.localizationId,
              attributes,
            },
          }
        );
        const output = result ? mapVersionLocalization(result.data) : { id: params.localizationId };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_list_app_info_localizations
// ---------------------------------------------------------------------------

interface AppInfoAttributes {
  appStoreState?: string;
}

interface AppInfoLocalizationAttributes {
  locale?: string;
  name?: string;
  subtitle?: string;
  privacyPolicyUrl?: string;
}

interface AppInfoLocalizationItem {
  id: string;
  appInfoId: string;
  appInfoState: string;
  locale: string;
  name: string;
  subtitle: string;
  privacyPolicyUrl: string;
}

const ListAppInfoLocalizationsInputSchema = z
  .object({
    appId: z.string().min(1).describe("The App Store Connect app ID to list app info localizations for."),
  })
  .strict();

type ListAppInfoLocalizationsInput = z.infer<typeof ListAppInfoLocalizationsInputSchema>;

export function registerListAppInfoLocalizationsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_app_info_localizations",
    {
      title: "List App Info Localizations",
      description: `List per-locale app-level metadata (name, subtitle, privacy policy URL) across all appInfos of an app. An app usually has two appInfos: the live one and the one currently being edited (distinguished by appInfoState).

Args:
  - appId (string, required): The App Store Connect app ID

Returns:
  {
    "count": number,
    "items": [
      {
        "id": string,             // pass to asc_update_app_info_localization
        "appInfoId": string,
        "appInfoState": string,   // e.g. "READY_FOR_DISTRIBUTION", "PREPARE_FOR_SUBMISSION"
        "locale": string,
        "name": string,
        "subtitle": string,
        "privacyPolicyUrl": string
      }
    ]
  }`,
      inputSchema: ListAppInfoLocalizationsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListAppInfoLocalizationsInput) => {
      try {
        const appInfosResponse = await getJson<JsonApiListResponse<AppInfoAttributes>>(
          `/v1/apps/${encodeURIComponent(params.appId)}/appInfos`
        );

        const items: AppInfoLocalizationItem[] = [];
        for (const appInfo of appInfosResponse.data) {
          const localizationsResponse = await getJson<JsonApiListResponse<AppInfoLocalizationAttributes>>(
            `/v1/appInfos/${encodeURIComponent(appInfo.id)}/appInfoLocalizations`
          );
          for (const localization of localizationsResponse.data) {
            items.push({
              id: localization.id,
              appInfoId: appInfo.id,
              appInfoState: appInfo.attributes?.appStoreState ?? "",
              locale: localization.attributes?.locale ?? "",
              name: localization.attributes?.name ?? "",
              subtitle: localization.attributes?.subtitle ?? "",
              privacyPolicyUrl: localization.attributes?.privacyPolicyUrl ?? "",
            });
          }
        }

        const output = { count: items.length, items };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_update_app_info_localization
// ---------------------------------------------------------------------------

const UpdateAppInfoLocalizationInputSchema = z
  .object({
    localizationId: z.string().min(1).describe("The app info localization ID to update."),
    name: z.string().optional().describe("App name for this locale."),
    subtitle: z.string().optional().describe("App subtitle for this locale."),
    privacyPolicyUrl: z.string().url().optional().describe("Privacy policy URL for this locale."),
  })
  .strict();

type UpdateAppInfoLocalizationInput = z.infer<typeof UpdateAppInfoLocalizationInputSchema>;

export function registerUpdateAppInfoLocalizationTool(server: McpServer): void {
  server.registerTool(
    "asc_update_app_info_localization",
    {
      title: "Update App Info Localization",
      description: `Update per-locale app-level metadata (name, subtitle, privacy policy URL). Only the fields you pass are updated. Only editable while the corresponding appInfo is in an editable state.

Args:
  - localizationId (string, required): The app info localization ID (from asc_list_app_info_localizations)
  - name (string, optional)
  - subtitle (string, optional)
  - privacyPolicyUrl (string, optional)

At least one of the optional fields must be provided.

Returns:
  {
    "id": string,
    "locale": string,
    "name": string,
    "subtitle": string,
    "privacyPolicyUrl": string
  }

Error Handling:
  - Returns an error if no updatable field is provided
  - Returns an error if the appInfo is not in an editable state`,
      inputSchema: UpdateAppInfoLocalizationInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: UpdateAppInfoLocalizationInput) => {
      try {
        const attributes = pickAttributes({
          name: params.name,
          subtitle: params.subtitle,
          privacyPolicyUrl: params.privacyPolicyUrl,
        });
        if (Object.keys(attributes).length === 0) {
          throw new Error(
            "更新するフィールドが1つも指定されていません。name/subtitle/privacyPolicyUrlのいずれかを指定してください。"
          );
        }

        const result = await patchJson<JsonApiSingleResponse<AppInfoLocalizationAttributes>>(
          `/v1/appInfoLocalizations/${encodeURIComponent(params.localizationId)}`,
          {
            data: {
              type: "appInfoLocalizations",
              id: params.localizationId,
              attributes,
            },
          }
        );
        const output = result
          ? {
              id: result.data.id,
              locale: result.data.attributes?.locale ?? "",
              name: result.data.attributes?.name ?? "",
              subtitle: result.data.attributes?.subtitle ?? "",
              privacyPolicyUrl: result.data.attributes?.privacyPolicyUrl ?? "",
            }
          : { id: params.localizationId };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}

// ---------------------------------------------------------------------------
// asc_set_version_build
// ---------------------------------------------------------------------------

const SetVersionBuildInputSchema = z
  .object({
    versionId: z.string().min(1).describe("The App Store version ID to attach a build to."),
    buildId: z.string().min(1).describe("The build ID (from asc_list_builds) to attach."),
  })
  .strict();

type SetVersionBuildInput = z.infer<typeof SetVersionBuildInputSchema>;

export function registerSetVersionBuildTool(server: McpServer): void {
  server.registerTool(
    "asc_set_version_build",
    {
      title: "Set Version Build",
      description: `Attach a build to an App Store version's "build" relationship. This is required before the version can be submitted for review.

Args:
  - versionId (string, required): The App Store version ID
  - buildId (string, required): The build ID to attach

Returns:
  {
    "versionId": string,
    "buildId": string,
    "success": true
  }

Error Handling:
  - Returns an error if the build is not valid/processed, or if the version is not in an editable state`,
      inputSchema: SetVersionBuildInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: SetVersionBuildInput) => {
      try {
        await patchJson(`/v1/appStoreVersions/${encodeURIComponent(params.versionId)}/relationships/build`, {
          data: { type: "builds", id: params.buildId },
        });
        const output = { versionId: params.versionId, buildId: params.buildId, success: true };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
