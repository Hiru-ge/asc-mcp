import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiResource } from "../types.js";

interface AppStoreVersionAttributes {
  versionString?: string;
  appStoreState?: string;
  platform?: string;
  releaseType?: string;
  createdDate?: string;
}

interface AppStoreVersionItem {
  id: string;
  versionString: string;
  appStoreState: string;
  platform: string;
  releaseType: string;
  createdDate: string;
}

function mapVersion(resource: JsonApiResource<AppStoreVersionAttributes>): AppStoreVersionItem {
  return {
    id: resource.id,
    versionString: resource.attributes?.versionString ?? "",
    appStoreState: resource.attributes?.appStoreState ?? "",
    platform: resource.attributes?.platform ?? "",
    releaseType: resource.attributes?.releaseType ?? "",
    createdDate: resource.attributes?.createdDate ?? "",
  };
}

const InputSchema = z
  .object({
    appId: z.string().min(1).describe("The App Store Connect app ID to list App Store versions for."),
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type Input = z.infer<typeof InputSchema>;

export function registerListAppStoreVersionsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_app_store_versions",
    {
      title: "List App Store Versions",
      description: `List App Store versions for an app (both released and in-progress).

Args:
  - appId (string, required): The App Store Connect app ID
  - limit (number): Maximum number of versions to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call

Returns:
  {
    "count": number,
    "items": [
      {
        "id": string,
        "versionString": string,    // e.g. "1.3.3"
        "appStoreState": string,    // e.g. "READY_FOR_SALE", "IN_REVIEW", "PREPARE_FOR_SUBMISSION"
        "platform": string,         // e.g. "IOS"
        "releaseType": string,      // e.g. "MANUAL", "AFTER_APPROVAL", "SCHEDULED"
        "createdDate": string       // ISO 8601
      }
    ],
    "nextUrl": string | undefined
  }`,
      inputSchema: InputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => {
      try {
        const path = buildListPath(
          `/v1/apps/${encodeURIComponent(params.appId)}/appStoreVersions`,
          { limit: params.limit },
          params.nextUrl
        );
        const result = await fetchAndFlattenList(path, mapVersion);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
