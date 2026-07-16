import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiResource } from "../types.js";

interface BuildAttributes {
  version?: string;
  uploadedDate?: string;
  processingState?: string;
  expired?: boolean;
  expirationDate?: string;
}

interface BuildItem {
  id: string;
  version: string;
  uploadedDate: string;
  processingState: string;
  expired: boolean;
  expirationDate: string;
}

function mapBuild(resource: JsonApiResource<BuildAttributes>): BuildItem {
  return {
    id: resource.id,
    version: resource.attributes?.version ?? "",
    uploadedDate: resource.attributes?.uploadedDate ?? "",
    processingState: resource.attributes?.processingState ?? "",
    expired: resource.attributes?.expired ?? false,
    expirationDate: resource.attributes?.expirationDate ?? "",
  };
}

const InputSchema = z
  .object({
    appId: z.string().min(1).describe("The App Store Connect app ID to list builds for."),
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type Input = z.infer<typeof InputSchema>;

export function registerListBuildsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_builds",
    {
      title: "List Builds",
      description: `List builds uploaded for an app, sorted by upload date (newest first).

Args:
  - appId (string, required): The App Store Connect app ID
  - limit (number): Maximum number of builds to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call

Returns:
  {
    "count": number,
    "items": [
      {
        "id": string,
        "version": string,             // build number, e.g. "42"
        "uploadedDate": string,        // ISO 8601
        "processingState": string,     // e.g. "PROCESSING", "VALID", "FAILED", "INVALID"
        "expired": boolean,
        "expirationDate": string       // ISO 8601
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
          "/v1/builds",
          {
            "filter[app]": params.appId,
            sort: "-uploadedDate",
            limit: params.limit,
          },
          params.nextUrl
        );
        const result = await fetchAndFlattenList(path, mapBuild);
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
