# Strava MCP

[![MCP Badge](https://lobehub.com/badge/mcp/arjanlig-strava-mcp-server)](https://lobehub.com/mcp/arjanlig-strava-mcp-server)

An MCP server that connects Claude to your Strava data. Get training load analysis, weekly plans, and activity insights — all through conversation.

## What it does

- **Recent activities** — distances, times, heart rates
- **Training load analysis** — ATL, CTL, TSB metrics with advice (rest or train?)
- **Weekly training plan** — recommended hours and workout types based on your current form
- **Weekly statistics** — volume trends over time

## Install (recommended)

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

## Alternative: local install

If you prefer running the server locally:

### 1. Create a Strava API app

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app with:
- **Website**: `http://localhost`
- **Authorization Callback Domain**: `localhost`

### 2. Run the installer

```bash
curl -sSL https://raw.githubusercontent.com/ArjanLig/strava-mcp/main/install.sh | bash
```

### 3. Restart Claude Desktop

## Example prompts

- "What were my last 5 rides?"
- "How is my training load looking?"
- "Give me a training plan for this week"
- "Show my weekly stats for the past 8 weeks"

## Troubleshooting

**Remote connector not working?**
Remove and re-add the connector in Settings → Connectors.

**Local install: "Missing credentials" error**
Run `uvx strava-training-mcp@latest --auth` to set up authentication.

**Local install: tokens**
Tokens are refreshed automatically. Credentials stored in `~/.strava-mcp/config.json`.
