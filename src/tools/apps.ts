import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiResource } from "../types.js";

interface AppAttributes {
  name?: string;
  bundleId?: string;
  sku?: string;
  primaryLocale?: string;
}

interface AppItem {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
}

function mapApp(resource: JsonApiResource<AppAttributes>): AppItem {
  return {
    id: resource.id,
    name: resource.attributes?.name ?? "",
    bundleId: resource.attributes?.bundleId ?? "",
    sku: resource.attributes?.sku ?? "",
    primaryLocale: resource.attributes?.primaryLocale ?? "",
  };
}

const InputSchema = z
  .object({
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type Input = z.infer<typeof InputSchema>;

export function registerListAppsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_apps",
    {
      title: "List Apps",
      description: `List all apps registered in the App Store Connect account.

Args:
  - limit (number): Maximum number of apps to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call. Pass it back to fetch the next page.

Returns:
  {
    "count": number,       // number of apps in this response
    "items": [
      {
        "id": string,          // App Store Connect app ID
        "name": string,
        "bundleId": string,
        "sku": string,
        "primaryLocale": string
      }
    ],
    "nextUrl": string | undefined  // pass to a subsequent call to fetch the next page, absent if no more pages
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
        const path = buildListPath("/v1/apps", { limit: params.limit }, params.nextUrl);
        const result = await fetchAndFlattenList(path, mapApp);
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
