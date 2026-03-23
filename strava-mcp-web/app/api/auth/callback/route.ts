import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getOAuthState, getUserStravaApp, saveUserTokens, saveAuthCode } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state") ?? "";
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.json({ error: error ?? "missing_code" }, { status: 400 });
  }

  const [oauthState, clientState] = state.split("|");

  const stateData = await getOAuthState(oauthState);
  if (!stateData) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  const { userId, clientId, redirectUri, codeChallenge } = stateData;

  // Use per-user Strava credentials if available, otherwise server credentials
  const userApp = await getUserStravaApp(userId);
  const stravaClientId = userApp?.stravaClientId ?? process.env.STRAVA_CLIENT_ID!;
  const stravaClientSecret = userApp?.stravaClientSecret ?? process.env.STRAVA_CLIENT_SECRET!;

  // Exchange code with Strava
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: stravaClientId,
      client_secret: stravaClientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("Strava token exchange failed:", tokenRes.status, errorBody);
    return NextResponse.json({ error: "strava_token_exchange_failed", status: tokenRes.status, detail: errorBody }, { status: 502 });
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  await saveUserTokens(userId, {
    stravaAccessToken: tokenData.access_token,
    stravaRefreshToken: tokenData.refresh_token,
    stravaExpiresAt: tokenData.expires_at,
  });

  const authCode = randomBytes(32).toString("hex");
  await saveAuthCode(authCode, { userId, clientId, codeChallenge });

  const redirectParams = new URLSearchParams({
    code: authCode,
    state: clientState ?? "",
  });

  return NextResponse.redirect(`${redirectUri}?${redirectParams.toString()}`);
}
