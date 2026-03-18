# Strava Remote MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A remote MCP server on Vercel that lets users connect Strava to Claude Desktop by pasting one URL — zero terminal, zero local install.

**Architecture:** Next.js App Router project with Streamable HTTP MCP endpoint, MCP OAuth flow that delegates to Strava, and Upstash Redis for encrypted token storage. Landing page with copy-button for the MCP URL.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, `@modelcontextprotocol/sdk`, Upstash Redis, Vercel hosting (free tier)

**Spec:** `docs/superpowers/specs/2026-03-18-remote-mcp-server-design.md`

---

## File Structure

```
strava-mcp-web/
  app/
    page.tsx                                    — Landing page with URL + instructions
    layout.tsx                                  — Root layout
    globals.css                                 — Minimal styles
    mcp/
      route.ts                                  — MCP Streamable HTTP endpoint (POST/GET/DELETE)
    .well-known/
      oauth-authorization-server/
        route.ts                                — OAuth metadata discovery
    api/
      auth/
        authorize/route.ts                      — Redirect to Strava OAuth
        callback/route.ts                       — Handle Strava callback, store tokens
        token/route.ts                          — Issue/refresh access tokens for Claude
        register/route.ts                       — Dynamic client registration (RFC 7591)
  lib/
    strava.ts                                   — Strava API fetch wrapper
    redis.ts                                    — Upstash Redis client + encrypted read/write
    crypto.ts                                   — AES-256-GCM encrypt/decrypt + JWT sign/verify
    tools.ts                                    — MCP tool definitions + handlers
    training.ts                                 — Training load calculations (ATL/CTL/TSB)
  package.json
  tsconfig.json
  next.config.ts
  .env.local.example                            — Template for env vars
  .gitignore
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `strava-mcp-web/package.json`
- Create: `strava-mcp-web/tsconfig.json`
- Create: `strava-mcp-web/next.config.ts`
- Create: `strava-mcp-web/.gitignore`
- Create: `strava-mcp-web/.env.local.example`
- Create: `strava-mcp-web/app/layout.tsx`
- Create: `strava-mcp-web/app/page.tsx`
- Create: `strava-mcp-web/app/globals.css`

- [ ] **Step 1: Create Next.js project**

```bash
cd /Users/administrator/strava-mcp
npx create-next-app@latest strava-mcp-web --typescript --app --no-tailwind --no-eslint --no-src-dir --no-import-alias --use-npm
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/administrator/strava-mcp/strava-mcp-web
npm install @modelcontextprotocol/sdk @upstash/redis jose
```

- `@modelcontextprotocol/sdk` — MCP server + Streamable HTTP transport
- `@upstash/redis` — Redis client for token storage
- `jose` — JWT signing/verification (lightweight, works in Edge + Node)

- [ ] **Step 3: Create .env.local.example**

```bash
# strava-mcp-web/.env.local.example
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ENCRYPTION_KEY=           # 32-byte hex string for AES-256-GCM
JWT_SECRET=               # Random string for signing access tokens
NEXT_PUBLIC_BASE_URL=     # e.g. https://strava-mcp.vercel.app
```

- [ ] **Step 4: Verify dev server starts**

```bash
cd /Users/administrator/strava-mcp/strava-mcp-web
npm run dev
```

Open http://localhost:3000 — should show default Next.js page.

- [ ] **Step 5: Commit**

```bash
git add strava-mcp-web/
git commit -m "feat: scaffold Next.js project for remote MCP server"
```

---

### Task 2: Crypto Utilities

**Files:**
- Create: `strava-mcp-web/lib/crypto.ts`

- [ ] **Step 1: Write crypto module**

```typescript
// strava-mcp-web/lib/crypto.ts
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { SignJWT, jwtVerify } from "jose";

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

// --- AES-256-GCM encryption for tokens stored in Redis ---

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, ciphertextHex] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// --- JWT for access tokens issued to Claude ---

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload.sub!;
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/administrator/strava-mcp/strava-mcp-web
npx tsc --noEmit lib/crypto.ts 2>&1 || echo "Check for errors"
```

- [ ] **Step 3: Commit**

```bash
git add strava-mcp-web/lib/crypto.ts
git commit -m "feat: add crypto utilities for token encryption and JWTs"
```

---

### Task 3: Redis Token Storage

**Files:**
- Create: `strava-mcp-web/lib/redis.ts`

- [ ] **Step 1: Write Redis module**

```typescript
// strava-mcp-web/lib/redis.ts
import { Redis } from "@upstash/redis";
import { encrypt, decrypt } from "./crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export interface UserTokens {
  stravaAccessToken: string;
  stravaRefreshToken: string;
  stravaExpiresAt: number; // Unix timestamp
}

export async function saveUserTokens(
  userId: string,
  tokens: UserTokens
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(tokens));
  await redis.set(`user:${userId}`, encrypted);
}

export async function getUserTokens(
  userId: string
): Promise<UserTokens | null> {
  const data = await redis.get<string>(`user:${userId}`);
  if (!data) return null;
  return JSON.parse(decrypt(data));
}

export async function deleteUserTokens(userId: string): Promise<void> {
  await redis.del(`user:${userId}`);
}

// Store OAuth state -> userId mapping (short-lived)
export async function saveOAuthState(
  state: string,
  data: { userId: string; clientId: string; redirectUri: string; codeChallenge: string }
): Promise<void> {
  await redis.set(`oauth_state:${state}`, JSON.stringify(data), { ex: 600 }); // 10 min TTL
}

export async function getOAuthState(
  state: string
): Promise<{ userId: string; clientId: string; redirectUri: string; codeChallenge: string } | null> {
  const data = await redis.get<string>(`oauth_state:${state}`);
  if (!data) return null;
  await redis.del(`oauth_state:${state}`); // one-time use
  return typeof data === "string" ? JSON.parse(data) : data;
}

// Store authorization code -> userId mapping (short-lived)
export async function saveAuthCode(
  code: string,
  data: { userId: string; clientId: string; codeChallenge: string }
): Promise<void> {
  await redis.set(`auth_code:${code}`, JSON.stringify(data), { ex: 300 }); // 5 min TTL
}

export async function getAuthCode(
  code: string
): Promise<{ userId: string; clientId: string; codeChallenge: string } | null> {
  const data = await redis.get<string>(`auth_code:${code}`);
  if (!data) return null;
  await redis.del(`auth_code:${code}`); // one-time use
  return typeof data === "string" ? JSON.parse(data) : data;
}

// Dynamic client registration storage
export async function saveClient(
  clientId: string,
  data: { clientSecret: string; redirectUris: string[] }
): Promise<void> {
  await redis.set(`client:${clientId}`, JSON.stringify(data));
}

export async function getClient(
  clientId: string
): Promise<{ clientSecret: string; redirectUris: string[] } | null> {
  const data = await redis.get<string>(`client:${clientId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}
```

- [ ] **Step 2: Commit**

```bash
git add strava-mcp-web/lib/redis.ts
git commit -m "feat: add Redis token storage with encryption"
```

---

### Task 4: Strava API Client

**Files:**
- Create: `strava-mcp-web/lib/strava.ts`

- [ ] **Step 1: Write Strava API module**

```typescript
// strava-mcp-web/lib/strava.ts
import { getUserTokens, saveUserTokens } from "./redis";

const STRAVA_API = "https://www.strava.com/api/v3";

async function getValidToken(userId: string): Promise<string> {
  const tokens = await getUserTokens(userId);
  if (!tokens) throw new Error("No tokens found — re-authenticate required");

  // Refresh if expired (with 60s buffer)
  if (Date.now() / 1000 > tokens.stravaExpiresAt - 60) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: tokens.stravaRefreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`);

    const data = await res.json();
    await saveUserTokens(userId, {
      stravaAccessToken: data.access_token,
      stravaRefreshToken: data.refresh_token,
      stravaExpiresAt: data.expires_at,
    });
    return data.access_token;
  }

  return tokens.stravaAccessToken;
}

async function stravaFetch(userId: string, path: string): Promise<any> {
  const token = await getValidToken(userId);
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getAthlete(userId: string) {
  return stravaFetch(userId, "/athlete");
}

export async function getActivities(userId: string, limit: number = 10) {
  return stravaFetch(userId, `/athlete/activities?per_page=${limit}`);
}

export async function getActivity(userId: string, activityId: number) {
  return stravaFetch(userId, `/activities/${activityId}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add strava-mcp-web/lib/strava.ts
git commit -m "feat: add Strava API client with auto token refresh"
```

---

### Task 5: Training Load Calculations

**Files:**
- Create: `strava-mcp-web/lib/training.ts`

Port the training logic from `src/strava_mcp/server.py` (lines 42-254) to TypeScript.

- [ ] **Step 1: Write training module**

```typescript
// strava-mcp-web/lib/training.ts

interface Activity {
  start_date_local: string;
  suffer_score: number | null;
}

interface DailyLoads {
  [date: string]: number; // ISO date string -> load
}

interface TrainingLoads {
  atl: number;
  ctl: number;
  tsb: number;
  dailyLoads: DailyLoads;
}

export function calculateTrainingLoads(
  activities: Activity[],
  daysAtl = 7,
  daysCtl = 42
): TrainingLoads {
  const now = new Date();
  const dailyLoads: DailyLoads = {};

  for (const activity of activities) {
    const actDate = new Date(activity.start_date_local);
    const dateStr = actDate.toISOString().split("T")[0];
    const daysAgo = Math.floor(
      (now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysAgo > daysCtl) continue;

    const score = activity.suffer_score || 0;
    dailyLoads[dateStr] = (dailyLoads[dateStr] || 0) + score;
  }

  let atlSum = 0;
  for (let i = 0; i < daysAtl; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (key in dailyLoads) atlSum += dailyLoads[key];
  }

  let ctlSum = 0;
  for (let i = 0; i < daysCtl; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (key in dailyLoads) ctlSum += dailyLoads[key];
  }

  const atl = daysAtl > 0 ? atlSum / daysAtl : 0;
  const ctl = daysCtl > 0 ? ctlSum / daysCtl : 0;

  return {
    atl: Math.round(atl * 10) / 10,
    ctl: Math.round(ctl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
    dailyLoads,
  };
}

export function getTrainingRecommendation(tsb: number, atl: number, ctl: number) {
  let status: string, advice: string, intensity: string;

  if (tsb < -30) {
    status = "REST";
    advice = "You are very fatigued. Take at least 1-2 rest days.";
    intensity = "Rest or very light recovery ride (<60% FTP)";
  } else if (tsb < -10) {
    status = "EASY";
    advice = "Slightly fatigued. Train light or take a rest day.";
    intensity = "Zone 1-2 recovery rides, max 60-90 min";
  } else if (tsb < 5) {
    status = "MODERATE";
    advice = "Good balance! Train normally with moderate intensity.";
    intensity = "Zone 2-3 endurance, tempo intervals possible";
  } else if (tsb < 25) {
    status = "HARD";
    advice = "Fresh and well-recovered! Perfect for intense training.";
    intensity = "VO2max intervals, threshold work, race efforts";
  } else {
    status = "DETRAINING RISK";
    advice = "Haven't trained intensely in a while. Build up gradually.";
    intensity = "Build volume and intensity slowly";
  }

  let fitnessContext: string;
  if (ctl < 30) fitnessContext = "Base fitness is low. Focus on building volume.";
  else if (ctl < 60) fitnessContext = "Solid base fitness.";
  else fitnessContext = "High fitness level! Keep it up.";

  return { status, advice, intensity, fitnessContext };
}

export function calculateWeeklyTrends(dailyLoads: DailyLoads, weeks = 8) {
  const now = new Date();
  const trends = [];

  for (let w = 0; w < weeks; w++) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);

    let atlSum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (key in dailyLoads) atlSum += dailyLoads[key];
    }

    let ctlSum = 0;
    for (let i = 0; i < 42; i++) {
      const d = new Date(weekEnd);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      if (key in dailyLoads) ctlSum += dailyLoads[key];
    }

    const atl = atlSum / 7;
    const ctl = ctlSum / 42;

    trends.push({
      weekLabel: w === 0 ? "This week" : `Week -${w}`,
      atl: Math.round(atl * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  return trends.reverse();
}

export function calculateRampRate(weeklyTrends: ReturnType<typeof calculateWeeklyTrends>) {
  if (weeklyTrends.length < 2) return null;

  const current = weeklyTrends[weeklyTrends.length - 1];
  const previous = weeklyTrends[weeklyTrends.length - 2];

  if (previous.atl === 0) return null;

  const rate = ((current.atl - previous.atl) / previous.atl) * 100;

  let status: string, warning: string;
  if (rate > 15) {
    status = "TOO FAST";
    warning = "WARNING: Load increased >15% — high injury risk!";
  } else if (rate > 10) {
    status = "FAST";
    warning = "Caution: Load increased >10% — monitor fatigue closely";
  } else if (rate > 5) {
    status = "GOOD";
    warning = "Healthy progression — load increasing steadily";
  } else if (rate > -5) {
    status = "STABLE";
    warning = "Load is stable — good maintenance";
  } else {
    status = "DECLINING";
    warning = "Load is declining — recovery period or detraining?";
  }

  return {
    rate: Math.round(rate * 10) / 10,
    status,
    warning,
    currentAtl: current.atl,
    previousAtl: previous.atl,
  };
}

export function generateWeeklyRecommendation(
  tsb: number,
  atl: number,
  ctl: number,
  rampRate: ReturnType<typeof calculateRampRate>
) {
  const currentWeeklyHours = (atl * 7) / 60;
  let targetHours: number, volumeAdvice: string;

  if (rampRate && rampRate.rate > 10) {
    targetHours = currentWeeklyHours * 0.9;
    volumeAdvice = "Reduce volume by 10% (ramp rate too high)";
  } else if (tsb < -30) {
    targetHours = currentWeeklyHours * 0.7;
    volumeAdvice = "Reduce volume by 30% (recovery needed)";
  } else if (tsb < -10) {
    targetHours = currentWeeklyHours * 0.85;
    volumeAdvice = "Reduce volume by 15% (recovery week)";
  } else if (tsb > 15) {
    targetHours = currentWeeklyHours * 1.08;
    volumeAdvice = "Increase volume by 8% (good form for building)";
  } else if (tsb > 5) {
    targetHours = currentWeeklyHours * 1.05;
    volumeAdvice = "Increase volume by 5% (safe progression)";
  } else {
    targetHours = currentWeeklyHours;
    volumeAdvice = "Maintain current volume (good balance)";
  }

  let plan: Record<string, number>, intensityNote: string;

  if (tsb < -30) {
    plan = { endurance: 2, recovery: 2, intervals: 0, rest: 3 };
    intensityNote = "Focus on recovery — light rides only";
  } else if (tsb < -10) {
    plan = { endurance: 2, recovery: 2, intervals: 0, rest: 3 };
    intensityNote = "Recovery week — no intense workouts";
  } else if (tsb < 5) {
    plan = { endurance: 3, tempo: 1, recovery: 1, rest: 2 };
    intensityNote = "Balanced week — endurance + 1x tempo";
  } else if (tsb < 15) {
    plan = { endurance: 2, tempo: 1, intervals: 1, recovery: 1, rest: 2 };
    intensityNote = "Build week — endurance + intensity possible";
  } else {
    plan = { endurance: 2, intervals: 2, recovery: 1, rest: 2 };
    intensityNote = "High intensity week — you're fresh enough!";
  }

  return {
    targetHours: Math.round(targetHours * 10) / 10,
    currentHours: Math.round(currentWeeklyHours * 10) / 10,
    volumeAdvice,
    plan,
    intensityNote,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add strava-mcp-web/lib/training.ts
git commit -m "feat: port training load calculations to TypeScript"
```

---

### Task 6: MCP Tool Definitions & Handlers

**Files:**
- Create: `strava-mcp-web/lib/tools.ts`

- [ ] **Step 1: Write tools module**

This module defines the 5 MCP tools and their handlers. Each handler takes a `userId` (from the auth token) and the tool arguments, calls the Strava API, and returns formatted text.

```typescript
// strava-mcp-web/lib/tools.ts
import { Tool, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { getActivities, getActivity } from "./strava";
import {
  calculateTrainingLoads,
  getTrainingRecommendation,
  calculateWeeklyTrends,
  calculateRampRate,
  generateWeeklyRecommendation,
} from "./training";

export const tools: Tool[] = [
  {
    name: "get_recent_activities",
    description: "Get recent Strava activities (default: last 10)",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of activities (max 30)", default: 10 },
      },
    },
  },
  {
    name: "get_activity_details",
    description: "Get detailed info for a specific activity",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: { type: "string", description: "Activity ID" },
      },
      required: ["activity_id"],
    },
  },
  {
    name: "get_weekly_stats",
    description: "Weekly training statistics (distance, time, training load)",
    inputSchema: {
      type: "object",
      properties: {
        weeks: { type: "number", description: "Number of weeks back (default: 4)", default: 4 },
      },
    },
  },
  {
    name: "get_training_load_analysis",
    description: "Analyze training load with ATL, CTL, TSB and get REST or TRAIN advice",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_weekly_training_plan",
    description: "Get a weekly plan with recommended hours, workout types and intensities",
    inputSchema: { type: "object", properties: {} },
  },
];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export async function handleTool(
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<TextContent[]> {
  try {
    if (name === "get_recent_activities") {
      const limit = Math.min(Number(args.limit || 10), 30);
      const activities = await getActivities(userId, limit);

      let result = "RECENT ACTIVITIES\n\n";
      for (const a of activities) {
        const date = new Date(a.start_date_local).toLocaleDateString("nl-NL", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
        const distance = (a.distance / 1000).toFixed(1);
        const duration = formatDuration(a.moving_time);
        result += `${date}\n   ${a.name}\n   ${distance} km | ${duration}\n`;
        if (a.average_heartrate) result += `   ${Math.round(a.average_heartrate)} bpm avg\n`;
        result += `   ID: ${a.id}\n\n`;
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_activity_details") {
      const id = Number(args.activity_id);
      if (isNaN(id)) return [{ type: "text", text: "Invalid activity ID." }];

      const a = await getActivity(userId, id);
      let result = `ACTIVITY DETAILS\n\nName: ${a.name}\n`;
      result += `Date: ${new Date(a.start_date_local).toLocaleDateString("nl-NL")}\n`;
      result += `Distance: ${(a.distance / 1000).toFixed(1)} km\n`;
      result += `Time: ${formatDuration(a.moving_time)}\n`;
      result += `Avg Speed: ${(a.average_speed * 3.6).toFixed(1)} km/h\n`;
      if (a.average_heartrate) result += `Avg HR: ${Math.round(a.average_heartrate)} bpm\n`;
      if (a.max_heartrate) result += `Max HR: ${Math.round(a.max_heartrate)} bpm\n`;
      if (a.average_watts) result += `Avg Power: ${Math.round(a.average_watts)}W\n`;
      if (a.suffer_score) result += `Suffer Score: ${a.suffer_score}\n`;
      result += `\nDescription: ${a.description || "No description"}\n`;
      return [{ type: "text", text: result }];
    }

    if (name === "get_weekly_stats") {
      const weeks = Math.min(Number(args.weeks || 4), 52);
      const activities = await getActivities(userId, 200);
      const now = new Date();
      const weeklyData: Record<string, { distance: number; time: number; activities: number }> = {};

      for (const a of activities) {
        const actDate = new Date(a.start_date_local);
        const weekNum = Math.floor((now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
        if (weekNum >= weeks) continue;
        const label = weekNum === 0 ? "This week" : `Week -${weekNum}`;
        if (!weeklyData[label]) weeklyData[label] = { distance: 0, time: 0, activities: 0 };
        weeklyData[label].distance += a.distance / 1000;
        weeklyData[label].time += a.moving_time;
        weeklyData[label].activities += 1;
      }

      let result = `WEEKLY STATISTICS (last ${weeks} weeks)\n\n`;
      for (const week of Object.keys(weeklyData).sort().reverse()) {
        const d = weeklyData[week];
        result += `${week}:\n  ${d.activities} rides\n  ${d.distance.toFixed(1)} km\n  ${(d.time / 3600).toFixed(1)} hours\n\n`;
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_training_load_analysis") {
      const activities = await getActivities(userId, 200);
      const loads = calculateTrainingLoads(activities);
      const rec = getTrainingRecommendation(loads.tsb, loads.atl, loads.ctl);
      const trends = calculateWeeklyTrends(loads.dailyLoads, 8);
      const ramp = calculateRampRate(trends);

      let result = "TRAINING LOAD ANALYSIS\n\n";
      result += `CURRENT STATUS\nATL (Acute - 7 days): ${loads.atl}\nCTL (Chronic - 42 days): ${loads.ctl}\nTSB (Balance): ${loads.tsb}\n\n`;
      if (ramp) {
        result += `RAMP RATE\n${ramp.status}: ${ramp.rate > 0 ? "+" : ""}${ramp.rate}%\n${ramp.warning}\n\n`;
      }
      result += `ADVICE: ${rec.status}\n${rec.advice}\n\nIntensity: ${rec.intensity}\n${rec.fitnessContext}\n\n`;
      result += "WEEKLY TRENDS (last 8 weeks)\n";
      for (const t of trends) {
        result += `${t.weekLabel.padEnd(12)} ATL:${String(t.atl).padStart(6)} CTL:${String(t.ctl).padStart(6)} TSB:${String(t.tsb).padStart(6)}\n`;
      }
      return [{ type: "text", text: result }];
    }

    if (name === "get_weekly_training_plan") {
      const activities = await getActivities(userId, 200);
      const loads = calculateTrainingLoads(activities);
      const trends = calculateWeeklyTrends(loads.dailyLoads, 8);
      const ramp = calculateRampRate(trends);
      const plan = generateWeeklyRecommendation(loads.tsb, loads.atl, loads.ctl, ramp);

      let result = "WEEKLY TRAINING PLAN\n\n";
      result += `VOLUME ADVICE\nCurrent week: ~${plan.currentHours} hrs\nRecommended: ~${plan.targetHours} hrs\n${plan.volumeAdvice}\n\n`;
      result += "WORKOUT MIX\n";
      for (const [type, count] of Object.entries(plan.plan)) {
        result += `${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}x\n`;
      }
      result += `\n${plan.intensityNote}\n`;
      return [{ type: "text", text: result }];
    }

    return [{ type: "text", text: `Unknown tool: ${name}` }];
  } catch (e: any) {
    return [{ type: "text", text: `Error: ${e.message}` }];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add strava-mcp-web/lib/tools.ts
git commit -m "feat: add MCP tool definitions and handlers"
```

---

### Task 7: OAuth Endpoints

**Files:**
- Create: `strava-mcp-web/app/.well-known/oauth-authorization-server/route.ts`
- Create: `strava-mcp-web/app/api/auth/authorize/route.ts`
- Create: `strava-mcp-web/app/api/auth/callback/route.ts`
- Create: `strava-mcp-web/app/api/auth/token/route.ts`
- Create: `strava-mcp-web/app/api/auth/register/route.ts`

- [ ] **Step 1: OAuth metadata endpoint**

```typescript
// strava-mcp-web/app/.well-known/oauth-authorization-server/route.ts
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;
  return Response.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/auth/authorize`,
    token_endpoint: `${baseUrl}/api/auth/token`,
    registration_endpoint: `${baseUrl}/api/auth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["strava"],
  });
}
```

- [ ] **Step 2: Dynamic client registration**

```typescript
// strava-mcp-web/app/api/auth/register/route.ts
import { randomUUID, randomBytes } from "crypto";
import { saveClient } from "@/lib/redis";

export async function POST(request: Request) {
  const body = await request.json();
  const clientId = randomUUID();
  const clientSecret = randomBytes(32).toString("hex");

  await saveClient(clientId, {
    clientSecret,
    redirectUris: body.redirect_uris || [],
  });

  return Response.json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
    redirect_uris: body.redirect_uris || [],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
  }, { status: 201 });
}
```

- [ ] **Step 3: Authorize endpoint**

```typescript
// strava-mcp-web/app/api/auth/authorize/route.ts
import { randomUUID } from "crypto";
import { saveOAuthState } from "@/lib/redis";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const state = url.searchParams.get("state") || "";

  if (!clientId || !redirectUri) {
    return new Response("Missing client_id or redirect_uri", { status: 400 });
  }

  // Generate userId for this new user and save state
  const userId = randomUUID();
  const oauthState = randomUUID();

  await saveOAuthState(oauthState, { userId, clientId, redirectUri, codeChallenge });

  // Redirect to Strava OAuth
  const stravaUrl = new URL("https://www.strava.com/oauth/authorize");
  stravaUrl.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID!);
  stravaUrl.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`);
  stravaUrl.searchParams.set("response_type", "code");
  stravaUrl.searchParams.set("scope", "read,activity:read_all");
  stravaUrl.searchParams.set("state", `${oauthState}|${state}`);

  return Response.redirect(stravaUrl.toString());
}
```

- [ ] **Step 4: Strava callback endpoint**

```typescript
// strava-mcp-web/app/api/auth/callback/route.ts
import { randomBytes } from "crypto";
import { getOAuthState, saveUserTokens, saveAuthCode } from "@/lib/redis";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`Authorization failed: ${error}`, { status: 400 });
  }

  // Split our state from Claude's state
  const [oauthState, clientState] = stateParam.split("|");

  const stateData = await getOAuthState(oauthState);
  if (!stateData) {
    return new Response("Invalid or expired state", { status: 400 });
  }

  // Exchange code with Strava
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return new Response("Failed to exchange Strava token", { status: 500 });
  }

  const tokenData = await tokenRes.json();

  // Store Strava tokens
  await saveUserTokens(stateData.userId, {
    stravaAccessToken: tokenData.access_token,
    stravaRefreshToken: tokenData.refresh_token,
    stravaExpiresAt: tokenData.expires_at,
  });

  // Generate authorization code for Claude
  const authCode = randomBytes(32).toString("hex");
  await saveAuthCode(authCode, {
    userId: stateData.userId,
    clientId: stateData.clientId,
    codeChallenge: stateData.codeChallenge,
  });

  // Redirect back to Claude with auth code
  const redirectUrl = new URL(stateData.redirectUri);
  redirectUrl.searchParams.set("code", authCode);
  if (clientState) redirectUrl.searchParams.set("state", clientState);

  return Response.redirect(redirectUrl.toString());
}
```

- [ ] **Step 5: Token endpoint**

```typescript
// strava-mcp-web/app/api/auth/token/route.ts
import { createHash } from "crypto";
import { getAuthCode, getClient } from "@/lib/redis";
import { signAccessToken, signRefreshToken } from "@/lib/crypto";

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export async function POST(request: Request) {
  const body = await request.formData();
  const grantType = body.get("grant_type") as string;
  const clientId = body.get("client_id") as string;

  if (grantType === "authorization_code") {
    const code = body.get("code") as string;
    const codeVerifier = body.get("code_verifier") as string;

    const codeData = await getAuthCode(code);
    if (!codeData) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    // Verify PKCE
    if (codeData.codeChallenge) {
      const challenge = base64UrlEncode(
        createHash("sha256").update(codeVerifier).digest()
      );
      if (challenge !== codeData.codeChallenge) {
        return Response.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
      }
    }

    const accessToken = await signAccessToken(codeData.userId);
    const refreshToken = await signRefreshToken(codeData.userId);

    return Response.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
    });
  }

  if (grantType === "refresh_token") {
    const refreshTokenStr = body.get("refresh_token") as string;

    try {
      const { verifyAccessToken } = await import("@/lib/crypto");
      // Re-use verify for refresh tokens (same JWT structure)
      const { jwtVerify } = await import("jose");
      const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
      const { payload } = await jwtVerify(refreshTokenStr, JWT_SECRET);
      const userId = payload.sub!;

      const accessToken = await signAccessToken(userId);
      const newRefreshToken = await signRefreshToken(userId);

      return Response.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: newRefreshToken,
      });
    } catch {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
  }

  return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
}
```

- [ ] **Step 6: Commit**

```bash
git add strava-mcp-web/app/.well-known/ strava-mcp-web/app/api/auth/
git commit -m "feat: implement MCP OAuth flow with Strava delegation"
```

---

### Task 8: MCP Streamable HTTP Endpoint

**Files:**
- Create: `strava-mcp-web/app/mcp/route.ts`

This is the core MCP endpoint. Claude Desktop connects here. It uses `@modelcontextprotocol/sdk` with Streamable HTTP transport.

- [ ] **Step 1: Write MCP route handler**

```typescript
// strava-mcp-web/app/mcp/route.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { tools, handleTool } from "@/lib/tools";
import { verifyAccessToken } from "@/lib/crypto";
import { IncomingMessage, ServerResponse } from "http";
import { Readable } from "stream";
import { Socket } from "net";

// Convert Web Request to Node.js IncomingMessage
function toNodeRequest(request: Request): IncomingMessage {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const msg = new IncomingMessage(new Socket());
  msg.method = request.method;
  msg.url = url.pathname + url.search;
  msg.headers = headers;

  return msg;
}

// Create a writable ServerResponse that captures output
function createNodeResponse(): { res: ServerResponse; getResponse: () => Promise<Response> } {
  let resolve: (res: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });

  const chunks: Buffer[] = [];
  let statusCode = 200;
  const responseHeaders: Record<string, string> = {};

  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket));

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = (code: number, ...args: any[]) => {
    statusCode = code;
    const headers = args.find((a) => typeof a === "object" && !Array.isArray(a));
    if (headers) Object.assign(responseHeaders, headers);
    return originalWriteHead(code, ...args);
  };

  const originalWrite = res.write.bind(res);
  res.write = (chunk: any, ...args: any[]) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return originalWrite(chunk, ...args);
  };

  const originalEnd = res.end.bind(res);
  res.end = (chunk?: any, ...args: any[]) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    resolve!(
      new Response(body, {
        status: statusCode,
        headers: responseHeaders,
      })
    );
    return originalEnd(chunk, ...args);
  };

  return { res, getResponse: () => promise };
}

function extractUserId(request: Request): Promise<string> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  return verifyAccessToken(auth.slice(7));
}

function createMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "strava-training-mcp",
    version: "1.0.0",
  });

  // Register all tools
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema.properties || {}, async (args) => {
      const result = await handleTool(userId, tool.name, args);
      return { content: result };
    });
  }

  return server;
}

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await extractUserId(request);
  } catch {
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-authorization-server"',
        },
      }
    );
  }

  const body = await request.json();
  const server = createMcpServer(userId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const nodeReq = toNodeRequest(request);
  const { res: nodeRes, getResponse } = createNodeResponse();

  // Push body into the node request
  const readable = Readable.from(JSON.stringify(body));
  readable.pipe(nodeReq);

  await transport.handleRequest(nodeReq, nodeRes, body);
  return getResponse();
}

export async function GET(request: Request) {
  // SSE endpoint - return 405 for stateless mode
  return new Response("SSE not supported in stateless mode", { status: 405 });
}

export async function DELETE(request: Request) {
  return new Response("Session terminated", { status: 200 });
}
```

> **Note:** The Node.js req/res wrapping above is a first approach. If the SDK provides a Web-native transport or if the wrapping proves too complex, we can switch to a lightweight Express-in-serverless approach using `@as-integrations/next` or a custom adapter. The implementation agent should test this and iterate.

- [ ] **Step 2: Verify the dev server starts without errors**

```bash
cd /Users/administrator/strava-mcp/strava-mcp-web
npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add strava-mcp-web/app/mcp/
git commit -m "feat: add MCP Streamable HTTP endpoint"
```

---

### Task 9: Landing Page

**Files:**
- Modify: `strava-mcp-web/app/page.tsx`
- Modify: `strava-mcp-web/app/globals.css`

- [ ] **Step 1: Write landing page**

```tsx
// strava-mcp-web/app/page.tsx
"use client";
import { useState } from "react";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const mcpUrl = "https://strava-mcp.vercel.app/mcp";

  const copyUrl = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="container">
      <h1>Strava for Claude</h1>
      <p className="subtitle">
        Connect your Strava training data to Claude Desktop in 2 steps.
      </p>

      <div className="url-box">
        <code>{mcpUrl}</code>
        <button onClick={copyUrl}>{copied ? "Copied!" : "Copy"}</button>
      </div>

      <div className="steps">
        <div className="step">
          <span className="step-number">1</span>
          <div>
            <strong>Copy the URL above</strong>
          </div>
        </div>
        <div className="step">
          <span className="step-number">2</span>
          <div>
            <strong>Add to Claude Desktop</strong>
            <p>
              Open Claude Desktop → Settings → Connectors → Add custom
              connector → paste the URL → Connect
            </p>
          </div>
        </div>
      </div>

      <p className="note">
        Claude will ask you to authorize with Strava when you first use it.
        Your data stays between you and Claude.
      </p>

      <h2>What you can ask Claude</h2>
      <ul className="examples">
        <li>"What were my last 5 rides?"</li>
        <li>"How does my training load look?"</li>
        <li>"Give me a training plan for this week"</li>
        <li>"Show my weekly stats for the past month"</li>
      </ul>

      <footer>
        <a href="https://github.com/ArjanLig/strava-mcp">GitHub</a>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Write minimal CSS**

Replace `app/globals.css` with clean, minimal styles. Dark background, centered content, styled URL box with copy button, numbered steps. No framework needed — keep it under 100 lines.

- [ ] **Step 3: Test locally**

```bash
cd /Users/administrator/strava-mcp/strava-mcp-web
npm run dev
```

Open http://localhost:3000 — verify the page renders correctly.

- [ ] **Step 4: Commit**

```bash
git add strava-mcp-web/app/page.tsx strava-mcp-web/app/globals.css
git commit -m "feat: add landing page with install instructions"
```

---

### Task 10: Environment Setup & Deploy

**Files:**
- Modify: `strava-mcp-web/.env.local` (local only, not committed)

- [ ] **Step 1: Create Strava API app (if not reusing existing)**

Go to https://www.strava.com/settings/api and note the Client ID and Client Secret. Set:
- Website: `https://strava-mcp.vercel.app`
- Authorization Callback Domain: `strava-mcp.vercel.app`

- [ ] **Step 2: Create Vercel project**

```bash
cd /Users/administrator/strava-mcp/strava-mcp-web
npx vercel link
```

- [ ] **Step 3: Add Upstash Redis via Vercel Marketplace**

Go to Vercel Dashboard → project → Storage → Add → Upstash Redis (free tier). This auto-sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

- [ ] **Step 4: Set environment variables in Vercel**

```bash
npx vercel env add STRAVA_CLIENT_ID
npx vercel env add STRAVA_CLIENT_SECRET
npx vercel env add ENCRYPTION_KEY       # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx vercel env add JWT_SECRET           # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx vercel env add NEXT_PUBLIC_BASE_URL  # https://strava-mcp.vercel.app
```

- [ ] **Step 5: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 6: Test end-to-end**

1. Open Claude Desktop → Settings → Connectors → Add custom connector
2. Paste `https://strava-mcp.vercel.app/mcp`
3. Authorize with Strava when prompted
4. Ask Claude: "What were my last 3 rides?"

- [ ] **Step 7: Commit any final config changes**

```bash
git add -A
git commit -m "feat: complete remote MCP server ready for deployment"
```
