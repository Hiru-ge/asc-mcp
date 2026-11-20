# asc-mcp

[English](./README.md) | 日本語

[![npm](https://img.shields.io/npm/v/@hiru-ge/asc-mcp)](https://www.npmjs.com/package/@hiru-ge/asc-mcp)
[![license](https://img.shields.io/github/license/Hiru-ge/asc-mcp)](./LICENSE)

App Store Connect API 用の非公式MCPサーバー。Claude CodeなどのMCP対応エージェントから、リリース、審査提出、TestFlight、ASO分析、アプリ内課金まで、自分のアプリの運営を会話で進められる。73ツールを備える。

```bash
claude mcp add app-store-connect \
  -e ASC_KEY_ID=xxx -e ASC_ISSUER_ID=xxx -e ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_xxx.p8 \
  -- npx -y @hiru-ge/asc-mcp
```

あとはエージェントにそのまま頼むだけ

> 直近のカスタマーレビューを5件見せて

> バージョン1.4.0を作って、更新内容を入れて、最新ビルドを紐付けて審査に出して

> 「家計簿 無料」で検索したときのうちのアプリの順位は？

公式のApp Store Connect向けMCPサーバーはまだない。このMCPサーバーを使えば、読み取り専用のレポートにとどまらず、リリースから審査提出までの一連の作業をAIに任せられるようになる。

## できること

- リリース: バージョン作成、ローカライズ、ビルド紐付け、審査情報、審査提出、手動・自動・予約・段階的リリース
- スクリーンショット: セット作成、ローカル画像のアップロード、削除
- TestFlight: グループ、テスター、What to Test、外部テスト審査
- アプリ内課金: 消耗型・非消耗型の作成、ローカライズ、価格、配信国、審査提出
- 価格と配信国: 価格ポイント、価格スケジュール、国別の配信可否
- プロダクトページ: Product Page Optimization、カスタムプロダクトページ
- レビュー: 取得（並び順・国・星評価でフィルタ）とデベロッパー返信
- ASO分析: キーワード検索順位（認証不要）、Analytics Reports、売上レポート
- 診断: クラッシュ・ハングのログ、起動時間などのパフォーマンス指標

サブスクリプションとWebhookは対象外。

## セットアップ

1. [App Store Connect](https://appstoreconnect.apple.com/) の Users and Access > Integrations > App Store Connect API > Team Keys でAPIキーを作り、`.p8` をダウンロードする。`.p8` は一度しかダウンロードできない。同じページの Issuer ID と Key ID も控える。ロールは売上レポートまで使うなら Admin、使わないなら App Manager でよい。
2. 上のコマンドを実行する。Claude Desktop、Cursorなど JSON で設定するクライアントは、次の形で登録する。

```json
{
  "mcpServers": {
    "app-store-connect": {
      "command": "npx",
      "args": ["-y", "@hiru-ge/asc-mcp"],
      "env": {
        "ASC_KEY_ID": "xxx",
        "ASC_ISSUER_ID": "xxx",
        "ASC_PRIVATE_KEY_PATH": "/path/to/AuthKey_xxx.p8"
      }
    }
  }
}
```

| 環境変数 | 必須 | 説明 |
|---|---|---|
| `ASC_KEY_ID` | 必須 | APIキーのKey ID |
| `ASC_ISSUER_ID` | 必須 | Issuer ID |
| `ASC_PRIVATE_KEY_PATH` | 必須 | `.p8` ファイルの絶対パス |
| `ASC_VENDOR_NUMBER` | 任意 | 売上レポート用。Payments and Financial Reports ページに表示される数字 |

ソースから動かす場合は、クローンして `npm install && npm run build` を実行し、コマンドを `node /path/to/asc-mcp/dist/index.js` に置き換える。

## セキュリティ上の注意

レビュー本文は第三者が自由に書ける。そこに仕込まれた指示にエージェントが従い、`asc_reply_to_review` で公開返信を投稿する経路がありうる。審査提出、公開、価格変更、配信国変更、スクリーンショット削除のツールも含めて、自動承認に入れず、実行前に内容を確認すること。

## 免責事項

非公式のオープンソースプロジェクトで、Apple Inc.とは無関係。Apple・App Store Connect・iTunesは各社の商標。

## ライセンス

[MIT](./LICENSE)
