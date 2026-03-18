# Strava MCP Remote Server — Design Spec

## Overview

A remote MCP server hosted on Vercel that exposes Strava training data to Claude via the Custom Connectors system. Users paste one URL into Claude Desktop, authorize Strava, and the tools are available. Zero terminal, zero local install.

## User Flow

1. User copies URL from landing page (e.g. `https://strava-mcp.vercel.app/mcp`)
2. In Claude Desktop: Settings > Connectors > Add custom connector > paste URL
3. Claude triggers OAuth — user authorizes Strava in browser
4. Tools are immediately available in Claude

## Architecture

Single Vercel project (Next.js App Router, TypeScript) with three layers:

### 1. Landing Page (`/`)

Static page with:
- Brief explanation of what it does
- The MCP server URL to copy (with copy button)
- Step-by-step install instructions (3 steps with screenshots)
- Link to GitHub repo

### 2. OAuth Flow (`/api/auth/*`)

Implements the MCP OAuth specification so Claude Desktop handles auth automatically.

**Endpoints:**
- `GET /.well-known/oauth-authorization-server` — OAuth metadata (issuer, auth endpoint, token endpoint, scopes)
- `GET /api/auth/authorize` — Redirects to Strava OAuth with state parameter
- `GET /api/auth/callback` — Strava redirects back here with auth code
- `POST /api/auth/token` — Token exchange (auth code → access + refresh tokens) and token refresh

**Flow:**
```
Claude Desktop → GET /mcp → 401 Unauthorized
   → Claude reads OAuth metadata
   → Opens browser to /api/auth/authorize
   → Redirect to Strava OAuth
   → User authorizes
   → Strava redirects to /api/auth/callback
   → Server exchanges code for tokens, stores in KV
   → Server issues its own access token to Claude
   → Claude retries GET /mcp with token → 200 OK
```

**Strava API app:** One shared app owned by the project maintainer (Arjan). Client ID and secret stored as Vercel environment variables.

### 3. MCP Endpoint (`/mcp`)

Streamable HTTP transport endpoint. Requires valid auth token (issued by our OAuth flow). Uses stored Strava tokens from KV to call Strava API on behalf of the user.

**Tools (unchanged from current Python server):**

| Tool | Description |
|------|-------------|
| `get_recent_activities` | Last N activities (max 30) with distance, duration, HR |
| `get_activity_details` | Detailed data for one activity (speed, power, suffer score) |
| `get_weekly_stats` | Volume per week (rides, km, hours) |
| `get_training_load_analysis` | ATL/CTL/TSB with 8-week trends and ramp rate |
| `get_weekly_training_plan` | Recommended hours and workout mix based on current form |

### Storage — Vercel KV

Key-value store (Redis) for user tokens.

**Schema:**
- Key: `user:{userId}`
- Value: `{ stravaAccessToken, stravaRefreshToken, stravaTokenExpiresAt, createdAt }`
- Tokens encrypted at rest (AES-256-GCM with server-side key from env var)

**User ID:** Generated during OAuth flow (random UUID), embedded in the access token issued to Claude.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Strava API**: Direct `fetch` calls (no library needed)
- **Storage**: Vercel KV (free tier: 256MB, 30k req/day)
- **Hosting**: Vercel (free tier: 100GB bandwidth, 100k invocations/month)
- **Encryption**: Node.js `crypto` module (AES-256-GCM)

## Security

- Strava client_secret: server-side only (Vercel env var)
- User tokens: encrypted in KV with AES-256-GCM
- Access tokens issued to Claude: signed JWTs with expiry
- HTTPS only (Vercel default)
- Per-user token isolation
- Token refresh handled automatically (Strava tokens expire after 6 hours)

## Project Structure

```
strava-mcp-web/
  app/
    page.tsx                          — Landing page
    mcp/
      route.ts                        — MCP Streamable HTTP endpoint
    .well-known/
      oauth-authorization-server/
        route.ts                      — OAuth metadata
    api/
      auth/
        authorize/route.ts            — Start OAuth flow
        callback/route.ts             — Strava OAuth callback
        token/route.ts                — Token exchange
  lib/
    strava.ts                         — Strava API client
    kv.ts                             — KV read/write with encryption
    auth.ts                           — JWT signing/verification
    tools.ts                          — MCP tool definitions + handlers
    training.ts                       — Training load calculations (ATL/CTL/TSB)
  package.json
  vercel.json
```

## Free Tier Limits

| Service | Limit | Expected usage |
|---------|-------|----------------|
| Vercel functions | 100k invocations/month | ~1k per active user/month |
| Vercel KV | 256MB / 30k req/day | ~1KB per user, ~100 req/user/day |
| Strava API | 100 req/15min, 1000/day | Per user, enforced by Strava |
| Vercel bandwidth | 100GB/month | Minimal (JSON only) |

Supports ~100 active users comfortably on free tier.

## Out of Scope (for now)

- ChatGPT Custom GPT integration (future)
- User dashboard / token management UI
- Activity write operations (only read scope)
- Webhook-based real-time updates
