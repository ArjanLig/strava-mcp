import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAuthCode } from "@/lib/redis";
import { signAccessToken, signRefreshToken, verifyAccessToken } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const grantType = formData.get("grant_type") as string;

  if (grantType === "authorization_code") {
    const code = formData.get("code") as string;
    const codeVerifier = formData.get("code_verifier") as string;

    if (!code || !codeVerifier) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const authCodeData = await getAuthCode(code);
    if (!authCodeData) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const { userId, codeChallenge } = authCodeData;

    // Verify PKCE: SHA256(code_verifier) base64url must match stored codeChallenge
    const computedChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    if (computedChallenge !== codeChallenge) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const accessToken = await signAccessToken(userId);
    const refreshToken = await signRefreshToken(userId);

    return NextResponse.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = formData.get("refresh_token") as string;

    if (!refreshToken) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    let userId: string;
    try {
      userId = await verifyAccessToken(refreshToken);
    } catch {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }

    const newAccessToken = await signAccessToken(userId);
    const newRefreshToken = await signRefreshToken(userId);

    return NextResponse.json({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: newRefreshToken,
    });
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}
