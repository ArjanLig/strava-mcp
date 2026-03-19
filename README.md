# Strava MCP Server

[![MCP Badge](https://lobehub.com/badge/mcp/arjanlig-strava-mcp-server)](https://lobehub.com/mcp/arjanlig-strava-mcp-server)

Connect your Strava training data directly to Claude. This MCP (Model Context Protocol) server turns Claude into your personal cycling coach — analyzing your training load, planning workouts, and tracking your progress toward race goals.

![Strava × Claude MCP](strava_claude_mcp_logo.svg)

## Install

No terminal needed. Works with Claude Desktop and claude.ai.

**Prerequisites:** A Strava account with recorded activities and Claude Pro, Team, or Enterprise.

### 1. Add the connector

Open Claude Desktop → **Settings** → **Connectors** → **Add custom connector**

Paste this URL:

```
https://strava-mcp-web.vercel.app/mcp
```

### 2. Authorize Strava

Claude will ask you to connect your Strava account the first time you use it. Click **Authorize** and you're done.

That's it! Ask Claude about your training.

## What it does

The Strava MCP server gives Claude real-time access to your Strava data, enabling conversations like:

> "I just finished a ride, how did it go?"
> "I'm training for a 150km race in April — am I on track?"
> "What workout should I do tonight given my current fatigue?"

Instead of copying numbers from Strava into a chat, Claude pulls your data directly and reasons about it in context — your recent rides, your fitness trend, your goals.

## Tools

The server exposes five tools to Claude:

| Tool | Description |
|---|---|
| `get_recent_activities` | Fetches your last 10 activities with distance, duration, and average heart rate |
| `get_activity_details` | Deep dive into a specific ride — power, HR, speed, suffer score |
| `get_training_load_analysis` | Calculates your ATL, CTL, and TSB with training advice and 8-week trends |
| `get_weekly_stats` | Weekly volume summary — rides, kilometers, and hours over the last 4 weeks |
| `get_weekly_training_plan` | AI-generated weekly plan based on your current fitness and fatigue |

### Training load analysis

The headline feature. The server calculates your training metrics using the standard PMC (Performance Management Chart) model:

- **ATL (Acute Training Load)** — 7-day weighted average of training stress. How tired you are right now.
- **CTL (Chronic Training Load)** — 42-day weighted average. Your fitness level.
- **TSB (Training Stress Balance)** — CTL minus ATL. Positive = fresh, negative = fatigued.
- **Ramp rate** — Week-over-week change in load, with injury risk warnings above 15%.

The tool returns actionable advice based on these metrics: rest, easy, moderate, or hard training recommendations with specific intensity zones.

## How it works in practice

Here's what a typical coaching conversation looks like:

1. **You:** "I want to ride tonight, what should I do?"
2. **Claude** calls `get_training_load_analysis` → sees TSB of +8, CTL of 31
3. **Claude** calls `get_recent_activities` → sees your last ride was 2 days ago
4. **Claude:** "You're well rested with a TSB of +8. Good opportunity for a sweet spot session — something like 60 minutes at 85-90% FTP. You have room to push today."

Over time, Claude builds up context about your goals, your bike, your FTP, and your schedule — making the advice increasingly personalized.

## Example use cases

**Race preparation** — Track your CTL buildup toward a target fitness level for race day. Claude monitors your weekly progression and adjusts recommendations based on how much time you have left.

**Workout selection** — If you use a training platform like Wahoo SYSTM, Claude can recommend specific workouts based on your current TSB and what energy systems need work.

**Recovery management** — After a big weekend of riding (or skiing, or hiking), Claude factors in the cumulative fatigue and adjusts your next training block accordingly.

**Post-ride analysis** — Share your ride and get instant feedback on intensity distribution, heart rate zones, and how it fits into your broader training plan.

## Limitations

- Strava's training load metrics are HR-based, which underestimates fatigue from activities like skiing or strength training where HR stays low but muscular load is high
- Power data accuracy depends on your power meter or smart trainer
- The weekly training plan is a simple heuristic — it's not a replacement for a structured training program from a certified coach

## Troubleshooting

**Connector not working?**
Remove and re-add the connector in Settings → Connectors.

## Built with

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — Anthropic's open standard for connecting AI to external tools
- [Strava API v3](https://developers.strava.com/) — Access to athlete activities and metrics
- Node.js / TypeScript

## License

MIT
