/** list系ツールで共有するZodフィールド定義。 */
import { z } from "zod";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../services/list.js";

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .default(DEFAULT_LIMIT)
  .describe(`Maximum number of items to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`);

export const nextUrlField = z
  .string()
  .url()
  .optional()
  .describe(
    "The nextUrl value returned by a previous call to this tool. Pass it back unchanged to fetch the next page. Omit for the first page."
  );
