# Strava MCP

[![MCP Badge](https://lobehub.com/badge/mcp/arjanlig-strava-mcp-server)](https://lobehub.com/mcp/arjanlig-strava-mcp-server)

An MCP server that connects Claude to your Strava data. Get training load analysis, weekly plans, and activity insights — all through conversation.

## What it does

- **Recent activities** — distances, times, heart rates
- **Training load analysis** — ATL, CTL, TSB metrics with advice (rest or train?)
- **Weekly training plan** — recommended hours and workout types based on your current form
- **Weekly statistics** — volume trends over time

## Install

No terminal needed. Works with Claude Desktop and claude.ai.

### 1. Add the connector

Open Claude Desktop → **Settings** → **Connectors** → **Add custom connector**

Paste this URL:

```
https://strava-mcp-web.vercel.app/mcp
```

### 2. Authorize Strava

Claude will ask you to connect your Strava account the first time you use it. Click **Authorize** and you're done.

That's it! Ask Claude about your training.

## Example prompts

- "What were my last 5 rides?"
- "How is my training load looking?"
- "Give me a training plan for this week"
- "Show my weekly stats for the past 8 weeks"

## Troubleshooting

**Connector not working?**
Remove and re-add the connector in Settings → Connectors.
