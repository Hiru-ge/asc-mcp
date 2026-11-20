# asc-mcp

English | [日本語](./README.ja.md)

[![npm](https://img.shields.io/npm/v/@hiru-ge/asc-mcp)](https://www.npmjs.com/package/@hiru-ge/asc-mcp)
[![license](https://img.shields.io/github/license/Hiru-ge/asc-mcp)](./LICENSE)

An unofficial MCP server for the App Store Connect API. Ship iOS apps from a conversation with Claude Code, Cursor, or any MCP client: releases, App Review submission, TestFlight, in-app purchases, and ASO analysis. 73 tools.

```bash
claude mcp add app-store-connect \
  -e ASC_KEY_ID=xxx -e ASC_ISSUER_ID=xxx -e ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_xxx.p8 \
  -- npx -y @hiru-ge/asc-mcp
```

Then just ask:

> Show me the last 5 customer reviews for my app.

> Create version 1.4.0, set the What's New text, attach the latest build, and submit it for review.

> Where does my app rank for "habit tracker" in the US App Store?

Apple has no official MCP server for App Store Connect. This one covers the whole release loop, not just read-only reporting.

## Features

- Releases: create versions, localizations, attach builds, review details, submit to App Review, manual / automatic / scheduled / phased release
- Screenshots: create sets, upload local images, delete
- TestFlight: groups, testers, What to Test, external beta review
- In-app purchases: consumables and non-consumables, localizations, prices, availability, submission
- Pricing and availability: price points, schedules, per-territory availability
- Product pages: Product Page Optimization experiments, custom product pages
- Reviews: fetch (filter by sort, country, rating) and post developer replies
- ASO analysis: keyword search ranking (no auth needed), Analytics Reports, sales reports
- Diagnostics: crash and hang logs, launch time and power metrics

Subscriptions and webhooks are not supported.

## Setup

1. In [App Store Connect](https://appstoreconnect.apple.com/), open Users and Access > Integrations > App Store Connect API > Team Keys, create a key, and download the `.p8` file (Apple allows this only once). Note the Issuer ID and Key ID on the same page. Use the Admin role if you want sales reports, otherwise App Manager is enough.
2. Run the command above. For clients configured with JSON (Claude Desktop, Cursor, and others):

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

| Variable | Required | Description |
|---|---|---|
| `ASC_KEY_ID` | yes | Key ID of the API key |
| `ASC_ISSUER_ID` | yes | Issuer ID |
| `ASC_PRIVATE_KEY_PATH` | yes | Absolute path to the `.p8` file |
| `ASC_VENDOR_NUMBER` | no | For sales reports. The number shown on the Payments and Financial Reports page |

To run from source, clone the repo, run `npm install && npm run build`, and use `node /path/to/asc-mcp/dist/index.js` as the command.

## Security

Review text is written by third parties. An agent could follow instructions planted in a review and post a public reply through `asc_reply_to_review`. Keep that tool, and every tool that submits for review, releases, changes prices or availability, or deletes screenshots, off your client's auto-approve list, and check each action before running it.

## Disclaimer

Unofficial open-source project, not affiliated with Apple Inc. Apple, App Store Connect, and iTunes are trademarks of their respective owners.

## License

[MIT](./LICENSE)
