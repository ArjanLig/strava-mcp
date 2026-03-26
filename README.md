<!-- mcp-name: io.github.ArjanLig/strava-mcp -->
# Strava MCP Server

[![MCP Badge](https://lobehub.com/badge/mcp/arjanlig-strava-mcp-server)](https://lobehub.com/mcp/arjanlig-strava-mcp-server)

Connect your Strava training data to Claude. This MCP server turns Claude into your personal training coach — analyzing your training load, planning workouts, and tracking your progress. Works with cycling, running, and any sport you track on Strava.

![Strava MCP](strava_claude_mcp_logo.svg)

## Install

Works with [Claude Desktop](https://claude.ai/download) and [claude.ai](https://claude.ai) on any plan. Free plans can add 1 custom connector (remove any existing connector first), Pro and Max are unlimited.

### 1. Create a Strava API app

This takes about 2 minutes. You need a free Strava API app so Claude can access your data.

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Fill in the form — **Application Name**, **Category**, and **Description** can be anything (e.g. "My Claude connector")
3. Set **Authorization Callback Domain** to `strava-mcp-web.vercel.app`
4. Click **Create** and note your **Client ID** and **Client Secret**

### 2. Add the connector

1. Open Claude Desktop or [claude.ai](https://claude.ai)
2. Go to **Settings → Connectors → Add custom connector**
3. Paste this URL and save:

```
https://strava-mcp-web.vercel.app/mcp
```

### 3. Connect

Click **Connect** on the newly added connector. This opens a page where you enter your Strava Client ID and Client Secret, then authorize with Strava.

That's it! Ask Claude about your training.

## Tools

The server exposes 10 tools:

| Tool | Description |
|---|---|
| `get_recent_activities` | Your last activities with distance, duration, and heart rate |
| `get_activity_details` | Deep dive into a specific activity — power, HR, speed, suffer score |
| `get_training_load_analysis` | ATL, CTL, TSB with training advice and 8-week trends |
| `get_weekly_stats` | Weekly volume — activities, kilometers, hours |
| `get_weekly_training_plan` | Weekly plan based on current fitness and fatigue |
| `get_gear_maintenance` | Bike/shoe km totals with chain, cassette, tire warnings |
| `get_power_curve` | Best power outputs (5s–60min), FTP estimate, monthly comparison |
| `get_hr_zone_distribution` | Time in each HR zone with polarized training advice |
| `get_hr_drift_analysis` | Cardiac drift in steady rides — aerobic efficiency indicator |
| `check_workout_quality` | Interval consistency, power decoupling, recovery scoring |

## Example conversations

> "I want to ride tonight, what should I do?"
> "How is my training load looking?"
> "Check the quality of my last interval workout"
> "When do I need to replace my chain?"
> "What's my FTP and how does it compare to last month?"
> "Am I spending enough time in zone 2?"
> "I'm training for a 150km race in April — am I on track?"

## How it works

Claude pulls your Strava data in real-time and reasons about it in context — your recent rides, fitness trend, fatigue level, and goals.

**Training load analysis** uses the standard PMC model:
- **ATL** (7-day) — how tired you are now
- **CTL** (42-day) — your fitness level
- **TSB** — CTL minus ATL. Positive = fresh, negative = fatigued
- **Ramp rate** — week-over-week load change, with injury risk warnings

**Gear maintenance** tracks km on each bike and shoe, warning when chain (3000km), cassette (6000km), tires (5000km), or cables (8000km) need attention.

**Power curve** finds your best efforts across durations and estimates FTP at 95% of your 20-minute power.

**HR analysis** covers zone distribution (are you polarizing enough?) and cardiac drift (is your aerobic base improving?).

## Limitations

- Training load uses suffer score / HR — it underestimates fatigue from strength training or activities where HR stays low
- Power features require a power meter or smart trainer
- The weekly plan is a heuristic, not a replacement for a certified coach

## Troubleshooting

**Connector not working?**
Remove and re-add the connector in Settings → Connectors.

**Authentication error?**
Check that your Strava API app has `strava-mcp-web.vercel.app` as the callback domain.

## Website

[strava-mcp-web.vercel.app](https://strava-mcp-web.vercel.app)

## Built with

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — Anthropic's open standard for connecting AI to external tools
- [Strava API v3](https://developers.strava.com/) — Access to athlete activities and metrics

## License

MIT
