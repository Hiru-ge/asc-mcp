import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, getJson, patchJson, postJson } from "../client.js";
import type { JsonApiSingleResponse } from "../types.js";
import { pickDefined, requireAttributes, textResult } from "./shared.js";

interface ReviewDetailAttributes {
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  demoAccountName?: string;
  demoAccountPassword?: string;
  demoAccountRequired?: boolean;
  notes?: string;
}

const ReviewFieldsSchema = {
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  demoAccountName: z.string().optional(),
  demoAccountPassword: z.string().optional(),
  demoAccountRequired: z.boolean().optional(),
  notes: z.string().optional(),
};

export function registerReviewSubmissionTools(server: McpServer): void {
  const versionSchema = z.object({ versionId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_get_review_details",
    {
      title: "Get App Review Details",
      description: "Get the App Review contact information, demo account, and notes for an App Store version.",
      inputSchema: versionSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ versionId }) => {
      try {
        const result = await getJson<JsonApiSingleResponse<ReviewDetailAttributes>>(
          `/v1/appStoreVersions/${encodeURIComponent(versionId)}/appStoreReviewDetail`
        );
        return textResult({ id: result.data.id, ...(result.data.attributes ?? {}) });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const createSchema = z.object({ versionId: z.string().min(1), ...ReviewFieldsSchema }).strict();
  server.registerTool(
    "asc_create_review_details",
    {
      title: "Create App Review Details",
      description: "Create the App Review contact information, optional demo account, and notes for a version.",
      inputSchema: createSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ versionId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await postJson<JsonApiSingleResponse<ReviewDetailAttributes>>("/v1/appStoreReviewDetails", {
          data: {
            type: "appStoreReviewDetails",
            attributes,
            relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
          },
        });
        return textResult({ id: result.data.id, ...(result.data.attributes ?? {}) });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const updateSchema = z.object({ reviewDetailId: z.string().min(1), ...ReviewFieldsSchema }).strict();
  server.registerTool(
    "asc_update_review_details",
    {
      title: "Update App Review Details",
      description: "Update only the provided App Review contact, demo account, or notes fields.",
      inputSchema: updateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ reviewDetailId, ...fields }) => {
      try {
        const attributes = pickDefined(fields);
        requireAttributes(attributes);
        const result = await patchJson<JsonApiSingleResponse<ReviewDetailAttributes>>(
          `/v1/appStoreReviewDetails/${encodeURIComponent(reviewDetailId)}`,
          { data: { type: "appStoreReviewDetails", id: reviewDetailId, attributes } }
        );
        return textResult(result ? { id: result.data.id, ...(result.data.attributes ?? {}) } : { id: reviewDetailId });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const submitSchema = z.object({ appId: z.string().min(1), versionId: z.string().min(1) }).strict();
  server.registerTool(
    "asc_submit_app_store_version",
    {
      title: "Submit App Store Version",
      description: "Create a review submission, add one App Store version, and submit it to App Review.",
      inputSchema: submitSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, versionId }) => {
      try {
        const submission = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/reviewSubmissions", {
          data: {
            type: "reviewSubmissions",
            relationships: { app: { data: { type: "apps", id: appId } } },
          },
        });
        const submissionId = submission.data.id;
        const item = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/reviewSubmissionItems", {
          data: {
            type: "reviewSubmissionItems",
            relationships: {
              reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
              appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
            },
          },
        });
        const submitted = await patchJson<JsonApiSingleResponse<Record<string, unknown>>>(
          `/v1/reviewSubmissions/${encodeURIComponent(submissionId)}`,
          { data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } } }
        );
        return textResult({
          submissionId,
          submissionItemId: item.data.id,
          state: submitted?.data.attributes?.state ?? "SUBMITTED",
        });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );

  const submitItemSchema = z.object({
    appId: z.string().min(1),
    itemType: z.enum(["appStoreVersionExperiment", "appCustomProductPageVersion"]),
    itemId: z.string().min(1),
  }).strict();
  server.registerTool(
    "asc_submit_product_page_review_item",
    {
      title: "Submit Product Page Review Item",
      description: "Submit a Product Page Optimization experiment or custom product page version to App Review.",
      inputSchema: submitItemSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, itemType, itemId }) => {
      try {
        const submission = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/reviewSubmissions", {
          data: {
            type: "reviewSubmissions",
            relationships: { app: { data: { type: "apps", id: appId } } },
          },
        });
        const submissionId = submission.data.id;
        const resourceType = itemType === "appStoreVersionExperiment"
          ? "appStoreVersionExperiments"
          : "appCustomProductPageVersions";
        const item = await postJson<JsonApiSingleResponse<Record<string, unknown>>>("/v1/reviewSubmissionItems", {
          data: {
            type: "reviewSubmissionItems",
            relationships: {
              reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
              [itemType]: { data: { type: resourceType, id: itemId } },
            },
          },
        });
        await patchJson(`/v1/reviewSubmissions/${encodeURIComponent(submissionId)}`, {
          data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } },
        });
        return textResult({ submissionId, submissionItemId: item.data.id, itemType, itemId, submitted: true });
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatToolError(error) }] };
      }
    }
  );
}
