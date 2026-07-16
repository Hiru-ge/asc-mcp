# asc-mcp

An unofficial MCP server for the App Store Connect API — list apps, read/reply to customer reviews, list builds and App Store versions, fetch sales reports, and run ASO analysis (keyword ranking, Analytics Reports).

App Store Connect API 用の非公式MCPサーバー。Claude CodeなどのMCP対応エージェントから、自分のアプリの運営・分析データを直接扱えるようにする。

## できること

- App Store Connectに登録されているアプリの一覧取得
- カスタマーレビューの取得（並び順・国・星評価でフィルタ）とデベロッパー返信の投稿
- TestFlightビルド一覧の取得（処理状態・有効期限つき）
- App Storeバージョン一覧の取得（審査状況・リリースタイプ）
- 売上サマリーレポートの取得（日次・週次・月次・年次）
- App Storeでのキーワード検索順位チェック（認証不要・単体で使える）
- Analytics Reportsの取得（インプレッション・プロダクトページ閲覧・流入元別ダウンロードなどのASO分析データ）

## クイックスタート

### 1. App Store Connect APIキーを用意する

[App Store Connect](https://appstoreconnect.apple.com/) の **Users and Access** > **Integrations** > **App Store Connect API** > **Team Keys** でAPIキーを作成し（ロールは **App Manager** 推奨）、`.p8` ファイルをダウンロードする。秘密鍵は一度しかダウンロードできない点に注意。あわせて同ページで **Issuer ID** と **Key ID** を控える。詳細は[APIキー作成の詳細](#app-store-connect-apiキーの作成)を参照。

### 2. ビルドする

```bash
git clone https://github.com/Hiru-ge/asc-mcp.git
cd asc-mcp
npm install
npm run build
```

### 3. MCPクライアントに登録する

Claude Codeの場合:

```bash
claude mcp add --scope user app-store-connect \
  -e ASC_KEY_ID=xxx \
  -e ASC_ISSUER_ID=xxx \
  -e ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_xxx.p8 \
  -- node /path/to/asc-mcp/dist/index.js
```

`/path/to/asc-mcp` はクローンしたディレクトリの絶対パスに置き換える。売上レポートを使う場合は `-e ASC_VENDOR_NUMBER=xxxxx` も追加する（[Vendor Numberの場所](#vendor-number売上レポート用)）。

### 4. 動かしてみる

新しいセッションでエージェントにそのまま聞けばよい。

> 直近のカスタマーレビューを5件見せて

> 「カフェ 開拓」で検索したときのうちのアプリの順位は？

## App Store Connect APIキーの作成

1. [App Store Connect](https://appstoreconnect.apple.com/) にログインする。
2. **Users and Access** > **Integrations** > **App Store Connect API** > **Team Keys** を開く。
3. 「キーを生成」から新しいAPIキーを作成する。ロールは **App Manager** を推奨する（アプリ情報・レビュー返信・売上レポートへのアクセスに必要な範囲を満たしつつ、必要以上の権限を持たせない）。
4. 生成後に表示される `.p8` ファイルをダウンロードする。**この秘密鍵は一度しかダウンロードできない**。紛失した場合はキーを失効させて再発行する必要がある。ダウンロードしたファイルは安全な場所に保管すること（Gitリポジトリにコミットしない）。

### Issuer ID / Key ID の場所

- **Issuer ID**: 同じ **Integrations** > **App Store Connect API** ページの上部に表示される（例: `57246542-96fe-1a63-e053-0824d011072a`）。チーム全体で共通の値。
- **Key ID**: 作成したキーの一覧に表示される10文字程度の識別子（例: `2X9R4HXF34`）。`.p8` ファイル名にも `AuthKey_<Key ID>.p8` の形で含まれる。

### Vendor Number（売上レポート用）

`asc_get_sales_report` を使う場合のみ必要。App Store Connect の **Payments and Financial Reports** ページに表示される、契約ごとのベンダー番号（数字のみ）。

## 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `ASC_KEY_ID` | 必須 | APIキーのKey ID |
| `ASC_ISSUER_ID` | 必須 | Issuer ID |
| `ASC_PRIVATE_KEY_PATH` | 必須 | ダウンロードした `.p8` ファイルへの絶対パス |
| `ASC_VENDOR_NUMBER` | 任意 | 売上レポート取得（`asc_get_sales_report`）に使うベンダー番号 |

いずれかの必須環境変数が欠けている場合、サーバー自体は起動するが、各ツール呼び出し時に「どの環境変数が欠けているか」を明示したエラーメッセージが返る。

## ツール一覧

| ツール名 | 用途 |
|---|---|
| `asc_list_apps` | App Store Connectに登録されているアプリ一覧を取得する（id・name・bundleId・sku・primaryLocale） |
| `asc_list_customer_reviews` | 指定アプリのカスタマーレビュー一覧を取得する。並び順・国・星評価でフィルタ可能 |
| `asc_reply_to_review` | カスタマーレビューにデベロッパー返信を投稿する |
| `asc_list_builds` | 指定アプリにアップロードされたビルド一覧を取得する（アップロード日時降順） |
| `asc_list_app_store_versions` | 指定アプリのApp Storeバージョン一覧を取得する（審査状況・リリースタイプなど） |
| `asc_get_sales_report` | 売上サマリーレポート（SALES/SUMMARY/version 1.0）をTSVとして取得し、パースして返す。`ASC_VENDOR_NUMBER` が必要 |
| `asc_search_ranking` | 公開iTunes Search APIを使ったキーワード順位チェック。**App Store Connect認証(JWT)は不要**で、この1ツール単体で使える |
| `asc_request_analytics_reports` | Analytics Reportsのリクエスト（ONGOINGアクセス）をensureする。既存があれば再利用し、なければ新規作成する |
| `asc_list_analytics_reports` | `asc_request_analytics_reports` で取得した `requestId` から、利用可能なレポート一覧を取得する |
| `asc_get_analytics_report_data` | `asc_list_analytics_reports` で取得した `reportId` から、レポートインスタンスのデータ（CSV/TSV）を取得してパースする |

各list系ツールは `limit`（デフォルト20、最大200）と `nextUrl`（前回のレスポンスに含まれる `nextUrl` をそのまま渡すと次ページを取得）でページネーションに対応する。

### ASO分析ツールの使い方

- `asc_search_ranking` は認証情報なしで単体利用できる。`ASC_KEY_ID` 等が未設定でも動作する。
- Analytics Reports系は **`asc_request_analytics_reports` → `asc_list_analytics_reports` → `asc_get_analytics_report_data`** の順に呼び出す3段階フロー。
  - `asc_request_analytics_reports` で初めてONGOINGリクエストを作成した場合、実際にレポートが生成されるまで**最大48時間**かかる。生成前に `asc_list_analytics_reports` を呼んでも空になる。
  - 2回目以降は既存のONGOINGリクエストが再利用されるため、`requestId` を控えておけば毎回作成し直す必要はない。

## セキュリティ上の注意

- `asc_list_customer_reviews` が返すレビュー本文（`title` / `body`）は、第三者ユーザーが自由に書き込める未検証テキスト。この本文をLLMが読み取る過程で、レビュー文中に埋め込まれた指示（プロンプトインジェクション）に従ってしまう可能性がある。
- 同じサーバーに公開返信を投稿する `asc_reply_to_review` が同居しているため、悪意あるレビュー本文がエージェントへの指示を含んでいた場合、確認なしに公開返信が投稿される経路が成立しうる。`asc_reply_to_review` はMCPクライアントの自動承認（auto-approve）設定に含めず、実行内容を必ず人間が確認してから承認すること。

## 実装メモ

- JWTは `jose` の `importPKCS8` / `SignJWT` でES256署名する。有効期限はApp Store Connect APIの上限20分に対し19分に設定し、モジュール内でキャッシュ。残り2分を切ったら自動的に再生成する。
- list系ツールのレスポンスはJSON:APIの `attributes` を平坦化した配列で返し、トークン消費を抑える。
- 売上レポートは `Accept: application/a-gzip` でリクエストし、`node:zlib` の `gunzipSync` でTSVに展開してパースする。行数が多い場合は先頭50行と総行数のみを返す。
- `asc_search_ranking` は `https://itunes.apple.com/search` を素の `fetch` で叩く（JWT不使用）。iTunes Search APIには目安で約20リクエスト/分のレート制限があり、超過するとHTTP 403が返ることがある。
- Analytics Reportsのセグメントデータ（`analyticsReportInstances/{id}/segments` の `url`）は署名付きURLのため、Authorizationヘッダを付けずに素の `fetch` でダウンロードし、`gunzipSync` で展開する。セグメントはCSVまたはTSVで、先頭行にタブを含むかで区切り文字を判定する。複数セグメントは行を結合し、先頭50行と総行数のみを返す（`services/tsv.ts` の `parseAnalyticsSegments`）。

## 免責事項

本ツールは非公式のオープンソースプロジェクトであり、Apple Inc.とは無関係。Apple・App Store Connect・iTunesは各社の商標。

## ライセンス

[MIT](./LICENSE)
