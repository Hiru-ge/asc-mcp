# asc-mcp

An unofficial MCP server for the App Store Connect API — automate releases, App Review, metadata, screenshots, TestFlight, product page experiments, diagnostics, reports, reviews, and ASO analysis.

App Store Connect API 用の非公式MCPサーバー。Claude CodeなどのMCP対応エージェントから、自分のアプリの運営・分析データを直接扱えるようにする。

## できること

- App Store Connectに登録されているアプリの一覧取得
- カスタマーレビューの取得（並び順・国・星評価でフィルタ）とデベロッパー返信の投稿
- TestFlightビルド一覧の取得（処理状態・有効期限つき）
- App Storeバージョン一覧の取得（審査状況・リリースタイプ）
- 売上サマリーレポートの取得（日次・週次・月次・年次）
- App Storeでのキーワード検索順位チェック（認証不要・単体で使える）
- Analytics Reportsの取得（インプレッション・プロダクトページ閲覧・流入元別ダウンロードなどのASO分析データ）
- App Storeバージョン作成、ローカライズ、ビルド紐付け、審査情報更新、審査提出
- スクリーンショットセット作成、ローカル画像の分割アップロード、一覧・削除
- 手動・自動・予約リリース、段階的リリース、配信国、アプリ価格の管理
- TestFlightグループ・テスター・ビルド・What to Test・外部テスト審査の管理
- カスタムプロダクトページとProduct Page Optimizationの作成・更新
- クラッシュ・ハングの診断ログ、起動時間などのパフォーマンス指標の取得

- アプリ内課金（消耗型・非消耗型）の作成、ローカライズ、価格、配信国、審査用スクリーンショット、審査提出

サブスクリプション、Webhookの管理は対象外。

## クイックスタート

### 1. App Store Connect APIキーを用意する

[App Store Connect](https://appstoreconnect.apple.com/) の **Users and Access** > **Integrations** > **App Store Connect API** > **Team Keys** でAPIキーを作成し、`.p8` ファイルをダウンロードする。ロールは売上レポート（`asc_get_sales_report`）を使うなら **Admin**、使わないなら **App Manager** で足りる。秘密鍵は一度しかダウンロードできない点に注意。あわせて同ページで **Issuer ID** と **Key ID** を控える。詳細は[APIキー作成の詳細](#app-store-connect-apiキーの作成)を参照。

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
3. 「キーを生成」から新しいAPIキーを作成する。ロールの選び方は次のとおり。
   - **App Manager**: アプリ情報・レビュー取得と返信・ビルド・バージョン・Analytics Reportsをカバーする。売上レポートには権限が足りない（HTTP 403になる）
   - **Admin** または **Sales**: 売上レポート（`asc_get_sales_report`）も使う場合はこちら。SalesロールはSales and Trendsへのアクセスに特化しているが、レビュー返信など他ツールの権限が不足する場合があるため、全ツールを1つのキーで使うなら **Admin** が確実。キーのロールは作成後に変更できない
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
| `asc_create_app_store_version` | 新しいApp Storeバージョンを作成する |
| `asc_create_version_localization` | バージョンのローカライズを作成する |
| `asc_list_version_localizations` | 説明文、キーワード、更新内容などをロケール別に取得する |
| `asc_update_version_localization` | バージョンのローカライズを部分更新する |
| `asc_list_app_info_localizations` | アプリ名、サブタイトル、プライバシーポリシーURLをロケール別に取得する |
| `asc_update_app_info_localization` | アプリ情報のローカライズを部分更新する |
| `asc_set_version_build` | App Storeバージョンへ審査対象ビルドを紐付ける |
| `asc_get_review_details` | App Reviewの連絡先、デモアカウント、審査メモを取得する |
| `asc_create_review_details` | App Review情報を作成する |
| `asc_update_review_details` | App Review情報を部分更新する |
| `asc_submit_app_store_version` | Review Submissionを作り、バージョンを追加して審査へ提出する |
| `asc_submit_product_page_review_item` | Product Page Optimization実験またはカスタムページを審査へ提出する |
| `asc_create_screenshot_set` | 通常ページ、実験、カスタムページ用のスクリーンショットセットを作る |
| `asc_list_screenshot_sets` | ローカライズに属するスクリーンショットセットを取得する |
| `asc_list_screenshots` | セット内のスクリーンショットと処理状態を取得する |
| `asc_upload_screenshot` | ローカル画像を予約、分割アップロード、コミットする |
| `asc_delete_screenshot_resource` | スクリーンショットまたはセットを削除する |
| `asc_update_app_store_version` | リリース方式、公開予定日時、著作権などを更新する |
| `asc_enable_phased_release` | 7日間の段階的リリースを有効にする |
| `asc_update_phased_release` | 段階的リリースを開始、一時停止、再開、完了する |
| `asc_release_app_store_version` | 承認済みの手動リリース待ちバージョンを公開する |
| `asc_list_app_price_points` | 配信国ごとの価格候補と収益額を取得する |
| `asc_get_app_price_schedule` | 現在と予約済みの価格、価格ポイントIDを取得する |
| `asc_set_app_price` | 基準国の価格を即時変更または予約変更する |
| `asc_get_app_availability` | 国別の配信状況、公開日、予約注文設定を取得する |
| `asc_list_territory_availabilities` | 全配信国の設定をページネーション付きで取得する |
| `asc_update_territory_availability` | 1つの国で配信可否や公開日を更新する |
| `asc_list_beta_groups` | TestFlightグループを取得する |
| `asc_create_beta_group` | TestFlightグループを作成する |
| `asc_list_beta_testers` | TestFlightテスターを取得する |
| `asc_create_beta_tester` | TestFlightテスターを作成・招待する |
| `asc_add_to_beta_group` | テスターまたはビルドをグループへ追加する |
| `asc_list_beta_build_localizations` | ロケール別のWhat to Testを取得する |
| `asc_set_beta_build_localization` | ロケール別のWhat to Testを作成・更新する |
| `asc_get_build_beta_details` | TestFlightビルドの内部・外部テスト状態を取得する |
| `asc_update_build_beta_details` | 外部テスト開始時の自動招待を更新する |
| `asc_submit_beta_app_review` | ビルドを外部TestFlight向け審査へ提出する |
| `asc_list_product_page_experiments` | Product Page Optimization実験を取得する |
| `asc_create_product_page_experiment` | Product Page Optimization実験を作成する |
| `asc_update_product_page_experiment` | 実験の配分、状態、名前を更新する |
| `asc_create_experiment_treatment` | 実験のTreatmentを作成する |
| `asc_list_experiment_treatments` | 実験のTreatmentを取得する |
| `asc_create_experiment_treatment_localization` | Treatmentのローカライズを作成する |
| `asc_list_custom_product_pages` | カスタムプロダクトページを取得する |
| `asc_create_custom_product_page` | カスタムプロダクトページを作成する |
| `asc_update_custom_product_page` | カスタムプロダクトページの名前や表示状態を更新する |
| `asc_create_custom_product_page_version` | カスタムプロダクトページの編集可能バージョンを作成する |
| `asc_list_custom_product_page_versions` | カスタムプロダクトページのバージョンを取得する |
| `asc_update_custom_product_page_version` | カスタムプロダクトページのディープリンクを更新する |
| `asc_create_custom_product_page_localization` | カスタムページのローカライズを作成する |
| `asc_get_performance_metrics` | アプリまたはビルドの電力・パフォーマンス指標を取得する |
| `asc_list_diagnostic_signatures` | ビルドのクラッシュ、ハングなどの診断シグネチャを取得する |
| `asc_get_diagnostic_logs` | 診断シグネチャの匿名化ログとコールスタックを取得する |

各list系ツールは `limit`（デフォルト20、最大200）と `nextUrl`（前回のレスポンスに含まれる `nextUrl` をそのまま渡すと次ページを取得）でページネーションに対応する。

### リリース提出の基本フロー

1. `asc_create_app_store_version` でバージョンを作る。
2. `asc_create_version_localization` または `asc_update_version_localization` で更新内容などを入れる。
3. 必要なら `asc_create_screenshot_set` と `asc_upload_screenshot` で画像を更新する。
4. `asc_set_version_build` で処理済みビルドを紐付ける。
5. `asc_create_review_details` または `asc_update_review_details` で審査メモなどを整える。
6. `asc_submit_app_store_version` で審査へ提出する。

`asc_upload_screenshot` の `filePath` はMCPサーバープロセスから読めるローカルファイルの絶対パスを渡す。Product Page Optimization用のセットでは `localizationType` に `experimentTreatment`、カスタムプロダクトページ用では `customProductPage` を指定する。

### ASO分析ツールの使い方

- `asc_search_ranking` は認証情報なしで単体利用できる。`ASC_KEY_ID` 等が未設定でも動作する。
- Analytics Reports系は **`asc_request_analytics_reports` → `asc_list_analytics_reports` → `asc_get_analytics_report_data`** の順に呼び出す3段階フロー。
  - `asc_request_analytics_reports` で初めてONGOINGリクエストを作成した場合、実際にレポートが生成されるまで**最大48時間**かかる。生成前に `asc_list_analytics_reports` を呼んでも空になる。
  - 2回目以降は既存のONGOINGリクエストが再利用されるため、`requestId` を控えておけば毎回作成し直す必要はない。

## セキュリティ上の注意

- `asc_list_customer_reviews` が返すレビュー本文（`title` / `body`）は、第三者ユーザーが自由に書き込める未検証テキスト。この本文をLLMが読み取る過程で、レビュー文中に埋め込まれた指示（プロンプトインジェクション）に従ってしまう可能性がある。
- 同じサーバーに公開返信を投稿する `asc_reply_to_review` が同居しているため、悪意あるレビュー本文がエージェントへの指示を含んでいた場合、確認なしに公開返信が投稿される経路が成立しうる。`asc_reply_to_review` はMCPクライアントの自動承認（auto-approve）設定に含めず、実行内容を必ず人間が確認してから承認すること。
- 審査提出、公開、価格、配信国、スクリーンショット削除を行うツールは本番のApp Store Connectデータを変更する。これらも自動承認へ追加せず、対象アプリ、バージョン、国、価格を実行前に確認すること。

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
