import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, postJson } from "../client.js";
import { limitField, nextUrlField } from "../schemas/common.js";
import { buildListPath, fetchAndFlattenList } from "../services/list.js";
import type { JsonApiResource } from "../types.js";

enum ReviewSort {
  CREATED_DATE_ASC = "createdDate",
  CREATED_DATE_DESC = "-createdDate",
  RATING_ASC = "rating",
  RATING_DESC = "-rating",
}

interface CustomerReviewAttributes {
  rating?: number;
  title?: string;
  body?: string;
  reviewerNickname?: string;
  createdDate?: string;
  territory?: string;
}

interface CustomerReviewItem {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string;
  createdDate: string;
  territory: string;
}

function mapReview(resource: JsonApiResource<CustomerReviewAttributes>): CustomerReviewItem {
  return {
    id: resource.id,
    rating: resource.attributes?.rating ?? 0,
    title: resource.attributes?.title ?? "",
    body: resource.attributes?.body ?? "",
    reviewerNickname: resource.attributes?.reviewerNickname ?? "",
    createdDate: resource.attributes?.createdDate ?? "",
    territory: resource.attributes?.territory ?? "",
  };
}

const ListReviewsInputSchema = z
  .object({
    appId: z.string().min(1).describe("The App Store Connect app ID to list customer reviews for."),
    sort: z
      .nativeEnum(ReviewSort)
      .default(ReviewSort.CREATED_DATE_DESC)
      .describe(
        "Sort order: 'createdDate' (oldest first), '-createdDate' (newest first, default), 'rating' (lowest first), '-rating' (highest first)."
      ),
    territory: z
      .string()
      .length(3)
      .optional()
      .describe("Filter by ISO 3166-1 alpha-3 territory code (e.g. 'USA', 'JPN')."),
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Filter by star rating (1-5)."),
    limit: limitField,
    nextUrl: nextUrlField,
  })
  .strict();

type ListReviewsInput = z.infer<typeof ListReviewsInputSchema>;

export function registerListCustomerReviewsTool(server: McpServer): void {
  server.registerTool(
    "asc_list_customer_reviews",
    {
      title: "List Customer Reviews",
      description: `List customer reviews for an app.

Args:
  - appId (string, required): The App Store Connect app ID
  - sort (string): 'createdDate' | '-createdDate' (default) | 'rating' | '-rating'
  - territory (string, optional): ISO 3166-1 alpha-3 territory code filter (e.g. 'USA', 'JPN')
  - rating (number, optional): Filter by star rating, 1-5
  - limit (number): Maximum number of reviews to return (default 20, max 200)
  - nextUrl (string, optional): Pagination URL returned by a previous call

Returns:
  {
    "count": number,
    "items": [
      {
        "id": string,
        "rating": number,             // 1-5
        "title": string,
        "body": string,
        "reviewerNickname": string,
        "createdDate": string,        // ISO 8601
        "territory": string           // ISO 3166-1 alpha-3
      }
    ],
    "nextUrl": string | undefined
  }`,
      inputSchema: ListReviewsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListReviewsInput) => {
      try {
        const filter: Record<string, string | number | undefined> = {
          sort: params.sort,
          limit: params.limit,
        };
        if (params.territory) filter["filter[territory]"] = params.territory;
        if (params.rating !== undefined) filter["filter[rating]"] = params.rating;

        const path = buildListPath(
          `/v1/apps/${encodeURIComponent(params.appId)}/customerReviews`,
          filter,
          params.nextUrl
        );
        const result = await fetchAndFlattenList(path, mapReview);
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

const ReplyToReviewInputSchema = z
  .object({
    reviewId: z.string().min(1).describe("The customer review ID to reply to."),
    responseBody: z
      .string()
      .min(1)
      .max(5970)
      .describe("The developer response text to publish (App Store Connect limit: 5970 characters)."),
  })
  .strict();

type ReplyToReviewInput = z.infer<typeof ReplyToReviewInputSchema>;

interface CreateReviewResponseResult {
  data: JsonApiResource<{ responseBody?: string; state?: string; lastModifiedDate?: string }>;
}

export function registerReplyToReviewTool(server: McpServer): void {
  server.registerTool(
    "asc_reply_to_review",
    {
      title: "Reply to Customer Review",
      description: `Create a developer response to a customer review. If a response already exists for the review, this will fail (use the App Store Connect UI or API to update/delete an existing response first).

Args:
  - reviewId (string, required): The customer review ID to respond to
  - responseBody (string, required): The response text (max 5970 characters)

Returns:
  {
    "id": string,             // response ID
    "state": string,          // e.g. "PENDING_PUBLISH", "PUBLISHED"
    "responseBody": string,
    "lastModifiedDate": string
  }

Error Handling:
  - Returns an error if the review already has a response
  - Returns "Error: Resource not found" if reviewId does not exist`,
      inputSchema: ReplyToReviewInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: ReplyToReviewInput) => {
      try {
        const result = await createReviewResponse(params.reviewId, params.responseBody);
        const output = {
          id: result.data.id,
          state: result.data.attributes?.state ?? "",
          responseBody: result.data.attributes?.responseBody ?? "",
          lastModifiedDate: result.data.attributes?.lastModifiedDate ?? "",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
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

async function createReviewResponse(
  reviewId: string,
  responseBody: string
): Promise<CreateReviewResponseResult> {
  return postJson<CreateReviewResponseResult>("/v1/customerReviewResponses", {
    data: {
      type: "customerReviewResponses",
      attributes: { responseBody },
      relationships: {
        review: { data: { type: "customerReviews", id: reviewId } },
      },
    },
  });
}
