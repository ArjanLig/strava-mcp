# Strava MCP

An MCP server that connects Claude to your Strava data. Get training load analysis, weekly plans, and activity insights — all through conversation.

## What it does

- **Recent activities** — distances, times, heart rates
- **Training load analysis** — ATL, CTL, TSB metrics with advice (rest or train?)
- **Weekly training plan** — recommended hours and workout types based on your current form
- **Weekly statistics** — volume trends over time

## Installation

### Step 1: Create a Strava API application

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Fill in the form:
   - **Application Name**: anything (e.g. "My MCP")
   - **Category**: choose any
   - **Website**: `http://localhost`
   - **Authorization Callback Domain**: `localhost`
3. After creating, note your **Client ID** and **Client Secret**

### Step 2: Install and authenticate

Open a terminal and run:

```bash
uvx strava-mcp --auth
```

This will:
1. Ask for your Client ID and Client Secret
2. Open your browser to authorize with Strava
3. Save your tokens to `~/.strava-mcp/config.json`

### Step 3: Add to Claude Desktop

Open Claude Desktop settings → Developer → Edit Config, and add:

```json
{
  "mcpServers": {
    "strava": {
      "command": "uvx",
      "args": ["strava-mcp"]
    }
  }
}
```

Restart Claude Desktop. You can now ask Claude about your Strava activities!

## Example prompts

- "What were my last 5 rides?"
- "How is my training load looking?"
- "Give me a training plan for this week"
- "Show my weekly stats for the past 8 weeks"

## Troubleshooting

**"Missing credentials" error**
Run `uvx strava-mcp --auth` to set up authentication.

**"Token expired" errors**
Tokens are refreshed automatically. If it persists, run `uvx strava-mcp --auth` again.

**Can't find config file**
Credentials are stored in `~/.strava-mcp/config.json`.
