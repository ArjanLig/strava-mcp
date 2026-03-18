import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.NEXT_PUBLIC_BASE_URL!;

  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/api/auth/authorize`,
    token_endpoint: `${base}/api/auth/token`,
    registration_endpoint: `${base}/api/auth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["read", "activity:read_all"],
  });
}
