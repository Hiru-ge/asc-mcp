import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiSingleResponse } from "../types.js";
import { flattenResource, textResult, type ToolResponse } from "./shared.js";

// Apple公式のNomination.Attributesが取得時点で空だったため、属性は決め打ちせず返ってきた値をそのまま出す。
const NOMINATION_STATES = ["DRAFT", "SUBMITTED", "ARCHIVED"] as const;

const ListNominationsInputSchema = z
  .object({
    state: z
      .enum(NOMINATION_STATES)
      .default("SUBMITTED")
      .describe("Nomination state to list. The API requires it, so one call returns one state."),
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type ListNominationsInput = z.infer<typeof ListNominationsInputSchema>;

const GetNominationInputSchema = z
  .object({
    nominationId: z.string().min(1).describe("The featuring nomination ID."),
  })
  .strict();

type GetNominationInput = z.infer<typeof GetNominationInputSchema>;

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function errorResult(error: unknown): ToolResponse {
  return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
}

export function registerNominationTools(server: McpServer): void {
  server.registerTool(
    "asc_list_nominations",
    {
      title: "List Featuring Nominations",
      description: `List the featuring nominations (drafts and submitted) of the team.

Args:
  - state (string): 'DRAFT' | 'SUBMITTED' (default) | 'ARCHIVED'. The API requires a state filter
  - limit (number): Maximum number of nominations to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call

Returns:
  { "count": number, "items": [ { "id": string, ...attributes } ], "nextUrl": string | undefined }

Requires App Store Connect API 3.8.0 or later.`,
      inputSchema: ListNominationsInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (params: ListNominationsInput) => {
      try {
        const path = buildListPath("/v1/nominations", { "filter[state]": params.state, limit: params.limit }, params.nextUrl);
        return textResult(await fetchAndFlattenList(path, flattenResource));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "asc_get_nomination",
    {
      title: "Get Featuring Nomination",
      description: `Get the details of one featuring nomination.

Args:
  - nominationId (string, required): The nomination ID from asc_list_nominations

Returns:
  { "id": string, ...attributes }`,
      inputSchema: GetNominationInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (params: GetNominationInput) => {
      try {
        const response = await getJson<JsonApiSingleResponse<unknown>>(
          `/v1/nominations/${encodeURIComponent(params.nominationId)}`
        );
        return textResult(flattenResource(response.data));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
