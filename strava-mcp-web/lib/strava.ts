import { getUserTokens, getUserStravaApp, saveUserTokens } from "./redis";

const STRAVA_API = "https://www.strava.com/api/v3";

async function getValidToken(userId: string): Promise<string> {
  const tokens = await getUserTokens(userId);
  if (!tokens) throw new Error("No tokens found — re-authenticate required");

  if (Date.now() / 1000 > tokens.stravaExpiresAt - 60) {
    // Use per-user Strava credentials if available, otherwise server credentials
    const userApp = await getUserStravaApp(userId);
    const clientId = userApp?.stravaClientId ?? process.env.STRAVA_CLIENT_ID;
    const clientSecret = userApp?.stravaClientSecret ?? process.env.STRAVA_CLIENT_SECRET;

    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
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

export async function getActivityStreams(userId: string, activityId: number, types: string[] = ["watts", "heartrate"]) {
  return stravaFetch(userId, `/activities/${activityId}/streams?keys=${types.join(",")}&key_type=time`);
}
