/**
 * 公開iTunes Search APIを使ったキーワード順位チェック。
 * App Store Connect APIの認証(JWT)は不要なため、client.tsのauthorizedFetchは通さず素のfetchを使う。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolError, REQUEST_TIMEOUT_MS } from "../client.js";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_SEARCH_LIMIT = 200;

interface ItunesSearchResultItem {
  trackName?: string;
  bundleId?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  price?: number;
  genres?: string[];
}

interface ItunesSearchResponse {
  resultCount?: number;
  results?: ItunesSearchResultItem[];
}

interface TopResultItem {
  rank: number;
  trackName: string;
  bundleId: string;
  averageUserRating: number;
  userRatingCount: number;
  price: number;
  genres: string[];
}

function mapTopResult(item: ItunesSearchResultItem, rank: number): TopResultItem {
  return {
    rank,
    trackName: item.trackName ?? "",
    bundleId: item.bundleId ?? "",
    averageUserRating: item.averageUserRating ?? 0,
    userRatingCount: item.userRatingCount ?? 0,
    price: item.price ?? 0,
    genres: (item.genres ?? []).slice(0, 2),
  };
}

const InputSchema = z
  .object({
    keyword: z.string().min(1).describe("The search keyword to check the ranking for."),
    country: z
      .string()
      .length(2)
      .default("jp")
      .describe("ISO 3166-1 alpha-2 country code (default 'jp')."),
    bundleId: z
      .string()
      .optional()
      .describe(
        "Bundle ID of the target app. If provided, the tool looks up its rank within the search results (top 200)."
      ),
    topN: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of top-ranked results to include in the response (default 10, max 50)."),
  })
  .strict();

type Input = z.infer<typeof InputSchema>;

export function registerSearchRankingTool(server: McpServer): void {
  server.registerTool(
    "asc_search_ranking",
    {
      title: "Check App Store Search Ranking",
      description: `Check an app's search ranking for a keyword on the App Store, using the public iTunes Search API. No App Store Connect authentication (JWT) is required for this tool.

Args:
  - keyword (string, required): The search keyword
  - country (string): ISO 3166-1 alpha-2 country code (default 'jp')
  - bundleId (string, optional): Bundle ID of the target app. If provided, its rank within the top 200 results is looked up.
  - topN (number): Number of top results to include (default 10, max 50)

Returns:
  {
    "keyword": string,
    "country": string,
    "totalResults": number,
    "targetRank": number | null,       // bundleId指定時にランクが見つかった場合のみ数値、それ以外はnull
    "targetNote": string | undefined,  // targetRankがnullの場合の理由
    "target": {                        // bundleIdが上位200件内で見つかった場合のみ
      "trackName": string,
      "averageUserRating": number,
      "userRatingCount": number
    } | undefined,
    "topResults": [
      {
        "rank": number,
        "trackName": string,
        "bundleId": string,
        "averageUserRating": number,
        "userRatingCount": number,
        "price": number,
        "genres": string[]   // 先頭2件のみ
      }
    ]
  }

Error Handling:
  - iTunes Search APIはレート制限(目安: 約20リクエスト/分)があり、超過するとHTTP 403が返ることがある。その場合は時間をおいて再試行すること。`,
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
        const url = new URL(ITUNES_SEARCH_URL);
        url.searchParams.set("term", params.keyword);
        url.searchParams.set("country", params.country);
        url.searchParams.set("entity", "software");
        url.searchParams.set("limit", String(ITUNES_SEARCH_LIMIT));

        let response: Response;
        try {
          response = await fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        } catch (error) {
          if (error instanceof Error && error.name === "TimeoutError") {
            throw new Error(`iTunes Search APIへのリクエストがタイムアウトしました(${REQUEST_TIMEOUT_MS / 1000}秒)。`);
          }
          throw error;
        }
        if (!response.ok) {
          let hint = "";
          if (response.status === 403) {
            hint =
              " iTunes Search APIのレート制限(目安: 約20リクエスト/分)を超えた可能性があります。時間をおいて再試行してください。";
          }
          throw new Error(`iTunes Search APIエラー (HTTP ${response.status}).${hint}`);
        }

        const data = (await response.json()) as ItunesSearchResponse;
        const results = data.results ?? [];

        let targetRank: number | null = null;
        let targetNote: string | undefined;
        let target: TopResultItem | undefined;

        if (params.bundleId) {
          const index = results.findIndex((item) => item.bundleId === params.bundleId);
          if (index >= 0) {
            targetRank = index + 1;
            target = mapTopResult(results[index], targetRank);
          } else {
            targetNote = "検索結果200件内に見つかりませんでした。bundleIdの綴りも確認してください。";
          }
        } else {
          targetNote = "bundleId未指定のためランク検索は行っていません";
        }

        const topResults = results.slice(0, params.topN).map((item, index) => mapTopResult(item, index + 1));

        const output = {
          keyword: params.keyword,
          country: params.country,
          totalResults: data.resultCount ?? results.length,
          targetRank,
          targetNote,
          target: target
            ? {
                trackName: target.trackName,
                averageUserRating: target.averageUserRating,
                userRatingCount: target.userRatingCount,
              }
            : undefined,
          topResults,
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
