import { NextRequest, NextResponse } from "next/server";
import { peekOAuthState, saveUserStravaApp } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { oauth_state, client_state, mode, strava_client_id, strava_client_secret } = body;

  if (!oauth_state) {
    return NextResponse.json({ error: "missing_oauth_state" }, { status: 400 });
  }

  const stateData = await peekOAuthState(oauth_state);
  if (!stateData) {
    console.error("strava-redirect: invalid or expired oauth_state", oauth_state);
    return NextResponse.json({ error: "invalid_or_expired_state" }, { status: 400 });
  }

  if (mode !== "byoc") {
    return NextResponse.json({ error: "server_mode_not_available" }, { status: 400 });
  }

  if (!strava_client_id || !strava_client_secret) {
    return NextResponse.json({ error: "missing_strava_credentials" }, { status: 400 });
  }

  if (!/^\d+$/.test(strava_client_id)) {
    return NextResponse.json({ error: "invalid_client_id_format" }, { status: 400 });
  }

  if (!/^[a-f0-9]{40}$/i.test(strava_client_secret)) {
    return NextResponse.json({ error: "invalid_client_secret_format" }, { status: 400 });
  }

  await saveUserStravaApp(stateData.userId, {
    stravaClientId: strava_client_id,
    stravaClientSecret: strava_client_secret,
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL!;

  const stravaParams = new URLSearchParams({
    client_id: strava_client_id,
    redirect_uri: `${base}/api/auth/callback`,
    response_type: "code",
    scope: "read,activity:read_all",
    state: `${oauth_state}|${client_state ?? ""}`,
  });

  return NextResponse.json({
    redirect_url: `https://www.strava.com/oauth/authorize?${stravaParams.toString()}`,
  });
}
