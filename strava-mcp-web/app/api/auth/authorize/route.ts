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

  // Redirect to setup page where user chooses auth method
  const setupParams = new URLSearchParams({
    oauth_state: oauthState,
    client_state: state,
  });

  return NextResponse.redirect(`${base}/setup?${setupParams.toString()}`);
}
