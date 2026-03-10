# Strava MCP

An MCP server that connects Claude to your Strava data. Get training load analysis, weekly plans, and activity insights — all through conversation.

## What it does

- **Recent activities** — distances, times, heart rates
- **Training load analysis** — ATL, CTL, TSB metrics with advice (rest or train?)
- **Weekly training plan** — recommended hours and workout types based on your current form
- **Weekly statistics** — volume trends over time

## Quick install

### 1. Create a Strava API app

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app with:
- **Website**: `http://localhost`
- **Authorization Callback Domain**: `localhost`

Note your **Client ID** and **Client Secret**.

### 2. Run the installer

Open a terminal and paste:

```bash
curl -sSL https://raw.githubusercontent.com/ArjanLig/strava-mcp/main/install.sh | bash
```

This will install everything, walk you through Strava authorization, and configure Claude Desktop automatically.

### 3. Restart Claude Desktop

That's it! Ask Claude about your Strava activities.

## Manual install

If you prefer to set things up yourself:

```bash
uvx strava-training-mcp@latest --auth
```

Then add to your Claude Desktop config (`Settings → Developer → Edit Config`):

```json
{
  "mcpServers": {
    "strava": {
      "command": "uvx",
      "args": ["strava-training-mcp"]
    }
  }
}
```

## Example prompts

- "What were my last 5 rides?"
- "How is my training load looking?"
- "Give me a training plan for this week"
- "Show my weekly stats for the past 8 weeks"

## Troubleshooting

**"Missing credentials" error**
Run `uvx strava-training-mcp@latest --auth` to set up authentication.

**"Token expired" errors**
Tokens are refreshed automatically. If it persists, run `uvx strava-training-mcp@latest --auth` again.

**Credentials location**
`~/.strava-mcp/config.json`
