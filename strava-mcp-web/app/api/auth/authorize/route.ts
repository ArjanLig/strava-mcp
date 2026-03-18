import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveOAuthState } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const clientId = searchParams.get("client_id") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const state = searchParams.get("state") ?? "";

  const userId = randomUUID();
  const oauthState = randomUUID();

  await saveOAuthState(oauthState, { userId, clientId, redirectUri, codeChallenge });

  const base = process.env.NEXT_PUBLIC_BASE_URL!;
  const stravaClientId = process.env.STRAVA_CLIENT_ID!;

  const stravaParams = new URLSearchParams({
    client_id: stravaClientId,
    redirect_uri: `${base}/api/auth/callback`,
    response_type: "code",
    scope: "read,activity:read_all",
    state: `${oauthState}|${state}`,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${stravaParams.toString()}`);
}
